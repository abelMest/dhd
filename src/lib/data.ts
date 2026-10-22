// Build-time data. Reads Supabase when PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are set,
// otherwise the local seed (data/seed.json), so the site builds with no backend at all.
// Public pages only ever see published rows: the anon key plus row-level security guarantees that on Supabase,
// and the filters below do the same for the seed.
import { createClient } from '@supabase/supabase-js';
import seed from '../../data/seed.json';
import { withDefaults, type Copy } from './copy';
import { readingMinutes } from './markdown';
import { firstImage } from './images';

export interface Author {
  id: string; name: string; role: string; org: string; country: string; bio: string;
  linkedinUrl: string; substackUrl: string; photoUrl: string; isEditor: boolean;
}
export interface Article {
  id: string; title: string; dek: string; fr: string; topic: string; publishedAt: string;
  substackUrl: string; linkedinUrl: string; featured: boolean; pinned: boolean; startFor: string[];
  readMins: number; body: string; authorIds: string[];
  /** Hand-picked related editions (ids), shown before same-topic ones. */
  related: string[];
  /** Series name shared by every part ('' when not in a series), and this edition's part number. */
  series: string; seriesPart: number | null;
  /** Optional overrides for search results ('' = automatic). */
  seoTitle: string; seoDescription: string;
  /** First image in the body, used on cards. Empty when the edition has none. */
  image: string;
}
export interface Resource {
  id: string; title: string; url: string; summary: string; publisher: string; year: string; topic: string;
  type: string; countries: string[]; audience: string[]; addedAt: string;
}
export interface Opportunity {
  id: string; title: string; org: string; kind: string; url: string; deadline: string; eligibility: string;
  countries: string[]; verifiedAt: string;
}
export interface Partner {
  id: string; name: string; url: string; logoUrl: string;
  /** partner: works with the Digest now. past: organisations the team has worked with. */
  kind: 'partner' | 'past';
}
export interface Settings {
  subscribers: number; subscribersLabel: string; editionsTotal: number; substackUrl: string; linkedinUrl: string;
  /** Where the edition total comes from: on this site, only on Substack (counted at build), only on LinkedIn (editor's figure). */
  editionsBreakdown: { site: number; substackOnly: number | null; linkedinOnly: number };
}
export interface SiteData {
  articles: Article[]; authors: Author[]; resources: Resource[]; opportunities: Opportunity[];
  partners: Partner[];
  settings: Settings; copy: Copy; source: 'supabase' | 'seed';
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

// v6 stored a Substack profile in the "linkedin" field; route each URL to the right place.
function splitProfile(url: string) {
  return /substack\.com/i.test(url) ? { linkedinUrl: '', substackUrl: url } : { linkedinUrl: url, substackUrl: '' };
}

function finishArticle(a: Omit<Article, 'readMins' | 'image'> & { readMins?: number }): Article {
  return { ...a, readMins: a.body ? readingMinutes(a.body) : a.readMins || 6, image: firstImage(a.body) };
}

const byDateDesc = (a: Article, b: Article) => b.publishedAt.localeCompare(a.publishedAt);

// Copy values that referred to v6 features which no longer exist.
const RETIRED_COPY: Record<string, RegExp> = { latestTitle: /drag/i };
function cleanCopy(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!(RETIRED_COPY[k] && RETIRED_COPY[k].test(str(v)))) out[k] = v;
  return out;
}

function fromSeed(): SiteData {
  const s = seed as Record<string, any[]>;
  const articles = s.articles
    .filter((a) => a.status === 'published')
    .map((a) => finishArticle({
      id: a.id, title: str(a.title), dek: str(a.dek), fr: str(a.fr), topic: str(a.topic), publishedAt: str(a.publishedAt),
      substackUrl: str(a.substackUrl), linkedinUrl: str(a.linkedinUrl), featured: !!a.featured, pinned: !!a.pinned,
      startFor: arr(a.startFor), readMins: Number(a.readMins) || 0, body: str(a.body), authorIds: arr(a.authorIds),
      related: arr(a.related), series: str(a.series).trim(), seriesPart: Number(a.seriesPart) || null,
      seoTitle: str(a.seoTitle), seoDescription: str(a.seoDescription),
    }))
    .sort(byDateDesc);
  const authors = s.authors.map((a) => ({
    id: a.id, name: str(a.name), role: str(a.role), org: str(a.org), country: str(a.country), bio: str(a.bio),
    ...splitProfile(str(a.linkedin)), photoUrl: '', isEditor: !!a.isEditor,
  }));
  const resources = (s.resources || []).filter((r) => r.status !== 'pending').map((r) => ({
    id: r.id, title: str(r.title), url: str(r.url), summary: str(r.summary), publisher: str(r.publisher), year: str(r.year),
    topic: str(r.topic), type: str(r.type), countries: arr(r.countries), audience: arr(r.audience), addedAt: str(r.addedAt),
  }));
  const opportunities = (s.opportunities || []).filter((o) => o.status === 'published').map((o) => ({
    id: o.id, title: str(o.title), org: str(o.org), kind: str(o.kind), url: str(o.url), deadline: str(o.deadline),
    eligibility: str(o.eligibility), countries: arr(o.countries), verifiedAt: str(o.verifiedAt),
  }));
  const site = s.settings.find((x) => x.id === 'site') || {};
  const copy = s.settings.find((x) => x.id === 'copy') || {};
  return {
    articles, authors, resources, opportunities, partners: [], source: 'seed',
    settings: {
      subscribers: Number(site.subscribers) || 0, subscribersLabel: str(site.subscribersLabel),
      editionsTotal: Number(site.editions) || articles.length,
      editionsBreakdown: { site: articles.length, substackOnly: null, linkedinOnly: 0 },
      substackUrl: str(site.substackUrl) || 'https://dhdigest.substack.com/', linkedinUrl: str(site.linkedinUrl),
    },
    copy: withDefaults(cleanCopy(copy)),
  };
}

// ---- Live figures ---------------------------------------------------------------------------

/** Every post slug in the Substack archive (public, no login). null when Substack cannot be reached. */
async function substackSlugs(base: string): Promise<string[] | null> {
  const slugs: string[] = [];
  try {
    for (let offset = 0; offset < 2000; offset += 50) {
      const r = await fetch(`${base.replace(/\/+$/, '')}/api/v1/archive?sort=new&offset=${offset}&limit=50`, {
        headers: { 'User-Agent': 'DigitalHealthDigest-site-build' }, signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return null;
      const page = (await r.json()) as { slug?: string }[];
      slugs.push(...page.map((p) => str(p.slug)).filter(Boolean));
      if (page.length < 50) return slugs;
    }
    return slugs;
  } catch {
    return null;
  }
}

const substackSlug = (u: string) => (u.match(/\/p\/([^/?#]+)/) || [])[1] || '';

/** Editions in total = on this site + on Substack but not yet here + only on LinkedIn (the editor keeps that one figure). */
export function editionFigures(articles: Article[], linkedinOnly: number, fallbackTotal: number, slugs: string[] | null) {
  const site = articles.length;
  if (!slugs) {
    // Substack unreachable during this build: never show fewer than we know about.
    return { editionsTotal: Math.max(fallbackTotal, site + linkedinOnly), editionsBreakdown: { site, substackOnly: null, linkedinOnly } };
  }
  const here = new Set(articles.map((a) => substackSlug(a.substackUrl)).filter(Boolean));
  const substackOnly = slugs.filter((s) => !here.has(s)).length;
  return { editionsTotal: site + substackOnly + linkedinOnly, editionsBreakdown: { site, substackOnly, linkedinOnly } };
}

/** Subscribers = LinkedIn + Substack as last entered, labelled with the platforms and the month they were updated. */
export function subscriberFigures(s: Record<string, unknown> | null) {
  const li = Number(s?.subscribers_linkedin) || 0;
  const sub = Number(s?.subscribers_substack) || 0;
  if (!li && !sub) return { subscribers: Number(s?.subscribers) || 0, subscribersLabel: str(s?.subscribers_label) };  // older single figure
  const sources = [li && 'LinkedIn', sub && 'Substack'].filter(Boolean).join(' + ');
  const when = s?.subscribers_updated_at
    ? new Date(`${str(s.subscribers_updated_at)}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
  return { subscribers: li + sub, subscribersLabel: [sources, when].filter(Boolean).join(', ') };
}

async function fromSupabase(url: string, key: string): Promise<SiteData> {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const must = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string) => {
    const { data, error } = await p;
    if (error) throw new Error(`Supabase: could not read ${what}: ${error.message}`);
    return data as T;
  };
  const [arts, links, auths, res, opps, settings, copyRows, parts] = await Promise.all([
    must<any[]>(sb.from('articles').select('*').eq('status', 'published'), 'articles'),
    must<any[]>(sb.from('article_authors').select('*').order('position'), 'article_authors'),
    must<any[]>(sb.from('authors').select('*'), 'authors'),
    must<any[]>(sb.from('resources').select('*').eq('status', 'published'), 'resources'),
    must<any[]>(sb.from('opportunities').select('id,title,org,kind,url,deadline,eligibility,countries,verified_at').eq('status', 'published'), 'opportunities'),
    must<any>(sb.from('settings').select('*').eq('id', 1).maybeSingle(), 'settings'),
    must<any[]>(sb.from('site_copy').select('key,value'), 'site_copy'),
    must<any[]>(sb.from('partners').select('id,name,url,logo_path,kind,position').eq('status', 'published').order('position'), 'partners'),
  ]);
  const authorsOf = (id: string) => links.filter((l) => l.article_id === id).map((l) => l.author_id);
  const storage = (path: string) => (path ? `${url}/storage/v1/object/public/${path}` : '');
  const copy = Object.fromEntries(copyRows.map((r) => [r.key, r.value]));
  if (copy.aboutPhoto && !/^(https?:|data:)/.test(copy.aboutPhoto)) copy.aboutPhoto = storage(copy.aboutPhoto);
  const articles = arts.map((a) => finishArticle({
    id: a.id, title: str(a.title), dek: str(a.dek), fr: str(a.fr), topic: str(a.topic), publishedAt: str(a.published_at),
    substackUrl: str(a.substack_url), linkedinUrl: str(a.linkedin_url), featured: !!a.featured, pinned: !!a.pinned,
    startFor: arr(a.start_for), readMins: Number(a.read_mins) || 0, body: str(a.body_md), authorIds: authorsOf(a.id),
    related: arr(a.related), series: str(a.series).trim(), seriesPart: Number(a.series_part) || null,
    seoTitle: str(a.seo_title), seoDescription: str(a.seo_description),
  })).sort(byDateDesc);
  return {
    articles, source: 'supabase',
    partners: parts.filter((p) => p.logo_path).map((p) => ({
      id: p.id, name: str(p.name), url: str(p.url), logoUrl: storage(str(p.logo_path)), kind: p.kind === 'past' ? 'past' : 'partner',
    })),
    authors: auths.map((a) => ({
      id: a.id, name: str(a.name), role: str(a.role), org: str(a.org), country: str(a.country), bio: str(a.bio),
      linkedinUrl: str(a.linkedin_url), substackUrl: str(a.substack_url), photoUrl: storage(str(a.photo_path)), isEditor: !!a.is_editor,
    })),
    resources: res.map((r) => ({
      id: r.id, title: str(r.title), url: str(r.url), summary: str(r.summary), publisher: str(r.publisher), year: str(r.year),
      topic: str(r.topic), type: str(r.type), countries: arr(r.countries), audience: arr(r.audience), addedAt: str(r.added_at),
    })),
    opportunities: opps.map((o) => ({
      id: o.id, title: str(o.title), org: str(o.org), kind: str(o.kind), url: str(o.url), deadline: str(o.deadline),
      eligibility: str(o.eligibility), countries: arr(o.countries), verifiedAt: str(o.verified_at),
    })),
    settings: {
      ...subscriberFigures(settings),
      ...editionFigures(articles, Number(settings?.linkedin_only_editions) || 0, Number(settings?.editions_total) || 0,
        await substackSlugs(str(settings?.substack_url) || 'https://dhdigest.substack.com/')),
      substackUrl: str(settings?.substack_url) || 'https://dhdigest.substack.com/', linkedinUrl: str(settings?.linkedin_url),
    },
    copy: withDefaults(cleanCopy(copy)),
  };
}

let cached: Promise<SiteData> | null = null;
export function loadSite(): Promise<SiteData> {
  if (!cached) {
    const url = import.meta.env.PUBLIC_SUPABASE_URL;
    const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    cached = url && key ? fromSupabase(url, key) : Promise.resolve(fromSeed());
  }
  return cached;
}

// ---- Shared queries ----

export const today = () => new Date().toISOString().slice(0, 10);

export function authorsFor(site: SiteData, a: Article) {
  return a.authorIds.map((id) => site.authors.find((x) => x.id === id)).filter((x): x is Author => !!x);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/** Open, or no deadline. Closed items drop off at the next build; a nightly rebuild keeps this current. */
export function openOpportunities(site: SiteData, on = today()) {
  return site.opportunities
    .filter((o) => !o.deadline || o.deadline >= on)
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
}

export function oppState(o: Opportunity, on = today()) {
  if (o.deadline && o.deadline < on) return { label: 'Closed', tone: 'crit' };
  if (o.deadline && daysBetween(on, o.deadline) <= 14) return { label: 'Closing soon', tone: 'warn' };
  return { label: 'Open', tone: 'ok' };
}

/** Verification older than 30 days gets a warning, as in v6. */
export function verifyState(o: Opportunity, on = today()) {
  if (!o.verifiedAt) return { label: 'Not yet verified', tone: 'warn' };
  const age = daysBetween(o.verifiedAt, on);
  return { label: `Verified ${fmtDate(o.verifiedAt)}`, tone: age > 30 ? 'warn' : 'ok' };
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

/** Shortens text to at most `n` characters at a word boundary, adding an ellipsis when it cuts. */
export function clip(text: string, n = 158) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6)).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/** The search-result snippet: the editor's override, else the standfirst topped up from the opening paragraph. */
export function searchDescription(a: Article) {
  if (a.seoDescription.trim()) return clip(a.seoDescription);
  const dek = a.dek.trim();
  if (dek.length >= 120 || !a.body) return clip(dek || a.title);
  const opening = a.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^(#|!\[|>|[-*] |\d+\. |<)/.test(p)) || '';
  const plain = opening.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
  return clip([dek, plain].filter(Boolean).join(dek && !/[.!?]$/.test(dek) ? '. ' : ' '));
}

/** Up to `n` editions to read next: the hand-picked ones first (in the editor's order), then the same topic. */
export function relatedTo(site: SiteData, a: Article, n = 3) {
  const byId = new Map(site.articles.map((x) => [x.id, x]));
  const picked = a.related.map((id) => byId.get(id)).filter((x): x is Article => !!x && x.id !== a.id);
  const rest = site.articles.filter((x) => x.topic === a.topic && x.id !== a.id && !picked.includes(x));
  return { picked: picked.length > 0, list: [...picked, ...rest].slice(0, n) };
}

/** Every published part of this edition's series, in part order (then date). Empty when it is not in one. */
export function seriesOf(site: SiteData, a: Article) {
  if (!a.series) return [];
  const key = a.series.toLowerCase();
  return site.articles
    .filter((x) => x.series.toLowerCase() === key)
    .sort((x, y) => (x.seriesPart ?? 1e9) - (y.seriesPart ?? 1e9) || x.publishedAt.localeCompare(y.publishedAt));
}

/** APA 7 style: Mekonnen, A. M. (2026, July 20). Title. Digital Health Digest. URL */
export function apaCitation(a: Article, authors: Author[], url: string) {
  const name = (full: string) => {
    const w = full.replace(/^(Dr|Prof)\.?\s+/i, '').trim().split(/\s+/);
    const last = w.pop() || '';
    return w.length ? `${last}, ${w.map((x) => `${x[0]}.`).join(' ')}` : last;
  };
  const names = authors.map((x) => name(x.name));
  const who = !names.length ? 'Digital Health Digest' : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  const d = new Date(`${a.publishedAt}T00:00:00Z`);
  const when = `${d.getUTCFullYear()}, ${d.toLocaleDateString('en-GB', { month: 'long', day: 'numeric', timeZone: 'UTC' }).split(' ').reverse().join(' ')}`;
  return `${who} (${when}). ${a.title}. Digital Health Digest. ${url}`;
}

export function bibtex(a: Article, authors: Author[], url: string) {
  const year = a.publishedAt.slice(0, 4);
  const first = (authors[0]?.name || 'dhd').replace(/^(Dr|Prof)\.?\s+/i, '').split(/\s+/).pop()!.toLowerCase().replace(/[^a-z]/g, '');
  const esc = (t: string) => t.replace(/[{}]/g, '');
  return [
    `@online{${first}${year}${a.id.split('-')[0]},`,
    `  author = {${authors.map((x) => esc(x.name)).join(' and ') || 'Digital Health Digest'}},`,
    `  title = {${esc(a.title)}},`,
    `  date = {${a.publishedAt}},`,
    `  organization = {Digital Health Digest},`,
    `  url = {${url}},`,
    `}`,
  ].join('\n');
}

