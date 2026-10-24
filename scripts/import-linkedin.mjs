// Brings editions that were published only in the LinkedIn newsletter over to the site, as Markdown.
// LinkedIn has no feed, so the list of article addresses lives in scripts/data/linkedin-editions.txt
// (copy them from the newsletter page). Each article page is public and is read once, then cached.
//
//   node scripts/import-linkedin.mjs --dry-run      fetch, convert and report; write nothing
//   node scripts/import-linkedin.mjs                add the missing editions as drafts (needs SUPABASE_URL and
//                                                   SUPABASE_SERVICE_ROLE_KEY, read from .env if not set)
// Options: --publish   add them as published instead of drafts
//          --refetch   ignore the cache in scripts/data/linkedin-cache/
// Editions already on the site are matched by LinkedIn address or title; they only get their LinkedIn link filled in.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { htmlToMarkdown } from './import-substack.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const root = new URL('../', import.meta.url);
const cacheDir = new URL('scripts/data/linkedin-cache/', root);

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const SERIES = 'Digital Health Skills for Developing Regions';
// The editor's own topic choices where the keyword guess below gets it wrong.
const TOPIC_FOR = {
  'role-attitude-implementation-digital-health-africa': 'Policy & financing',
  'safeguarding-data-privacy-digital-health-era': 'Policy & financing',
  'digital-health-platform-dhp-africas-strategic-shift': 'Policy & financing',
  'from-echis-go-data-digital-health-improving': 'Public health',
  'health-policy-regulatory-updates': 'Policy & financing',
  'digital-health-pandemic-lessons-learned-opportunities-growth': 'Public health',
  'do-you-want-work-digital-health-sector': 'Health workforce',
  'ethiopia-digital-health': 'Policy & financing',
};
export const normTitle = (t) => String(t).normalize('NFKD').replace(/ø/gi, 'o').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function parseArticle(html, url) {
  const title = decode(/<title>([^<]*)/.exec(html)?.[1] || '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
  const date = /"datePublished":"(\d{4}-\d{2}-\d{2})/.exec(html)?.[1] || '';
  const cover = decode(/property="og:image" content="([^"]*)"/.exec(html)?.[1] || /og:image" content="([^"]*)"/.exec(html)?.[1] || '');
  const start = html.indexOf('<div data-test-id="article-content-blocks">');
  const end = html.indexOf('</article>', start);
  let body = start < 0 ? '' : html.slice(start, end);
  // Drop LinkedIn's "Recommended by LinkedIn" box, which sits between paragraphs.
  body = body.replace(/<div class="inline-articles[\s\S]*?(?=<div class="article-main__content"|$)/g, '');
  // Pictures load lazily on LinkedIn; the real address sits in data-delayed-url. "Article content" is LinkedIn's stock alt text.
  body = body.replace(/<img([^>]*?)\sdata-delayed-url="([^"]*)"/g, '<img$1 src="$2"').replace(/alt="Article content"/g, 'alt=""');
  // Links go through LinkedIn's redirector; point them straight at the source.
  body = body.replace(/href="https:\/\/www\.linkedin\.com\/redir\/redirect\?url=([^"&]*)[^"]*"/g, (_m, u) => {
    try { return `href="${decodeURIComponent(decode(u))}"`; } catch { return _m; }
  });
  // Some writers styled whole paragraphs as headings; only short ones stay headings.
  body = body.replace(/<h2 data-test-id="pulse-publishing-h1">([\s\S]*?)<\/h2>/g, (_m, inner) =>
    inner.replace(/<[^>]*>/g, '').trim().length > 120 ? `<p>${inner}</p>` : `<h2>${inner}</h2>`);
  let md = htmlToMarkdown(body).replace(/�/g, ' ').replace(/^#{1,6}\s*$/gm, '')
    .replace(/\?trk=[^)\s]*/g, '').replace(/^!\[[^\]]*\]\(null\)\n?(\*[^\n]*\*\n?)?/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  // Chapters of the "Digital Health Skills for Developing Regions" series open with "Chapter 0N" and the chapter name.
  let chapter = null, chapterTitle = '';
  const ch = /^\s*(?:#+\s*)?Chapter\s+0*(\d+)\s*\n+(?:#+\s*)?([^\n]{5,})\n/i.exec(md);
  if (ch) {
    chapter = Number(ch[1]);
    const short = ch[2].trim().length <= 90 && !/[.!?]$/.test(ch[2].trim());
    if (short) chapterTitle = ch[2].replace(/[*_]/g, '').trim();
    md = md.slice(ch[0].length - (short ? 0 : ch[2].length + 1)).trimStart();
  }
  return { url, title, date, cover, md, chapter, chapterTitle };
}

function guessTopic(text) {
  const t = text.toLowerCase();
  const score = {
    'AI & data': /\b(ai|artificial intelligence|machine learning|generative|chatbot|data science|analytics|algorithm|synthetic)\b/g,
    'Systems & interoperability': /\b(interoperab\w*|fhir|emr|ehr|standards?|platform|telehealth|telemedicine|blockchain|wearables?|remote patient|monitoring|infrastructure)\b/g,
    'Policy & financing': /\b(polic\w*|governance|leadership|regulat\w*|financ\w*|invest\w*|strategy|startups?|unicorns?|equity)\b/g,
    'Public health': /\b(public health|pandemic|surveillance|outbreak|one health|disease|behavioral|mental health|traditional medicine)\b/g,
    'Health workforce': /\b(skills?|workforce|health workers?|training|education|careers?|capacity)\b/g,
    'Supply chain & logistics': /\b(supply chain|logistics|medicines|vaccines|stock)\b/g,
  };
  let best = 'Systems & interoperability', top = 0;
  for (const [k, re] of Object.entries(score)) { const n = (t.match(re) || []).length; if (n > top) { top = n; best = k; } }
  return best;
}

function dekFrom(md) {
  const para = md.split(/\n\n/).map((p) => p.replace(/[*_#>`\[\]]|\(http[^)]*\)|!\S*/g, '').trim()).find((p) => p.length > 60 && !/^(by|photo|image)\b/i.test(p)) || '';
  const first = para.match(/^.{40,220}?[.!?](\s|$)/)?.[0]?.trim() || para.slice(0, 200).replace(/\s+\S*$/, '') + '…';
  return first;
}

export function slugFor(title, taken) {
  let s = normTitle(title).split(' ').filter((w) => !['the', 'a', 'an', 'of', 'and', 'in', 'for', 'to', 'on', 'how', 'is', 'its'].includes(w)).slice(0, 7).join('-') || 'edition';
  let out = s, n = 2;
  while (taken.has(out)) out = `${s}-${n++}`;
  taken.add(out);
  return out;
}

async function fetchArticle(slug) {
  const file = new URL(`${slug.replace(/[^a-z0-9-]/gi, '_')}.html`, cacheDir);
  if (existsSync(file) && !flag('--refetch')) return readFileSync(file, 'utf8');
  const r = await fetch(`https://www.linkedin.com/pulse/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error(`${slug}: HTTP ${r.status}`);
  const html = await r.text();
  writeFileSync(file, html);
  await new Promise((res) => setTimeout(res, 1500));
  return html;
}

function env() {
  const e = { ...process.env };
  const f = new URL('.env', root);
  if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^(\w+)=(.*)$/.exec(l); if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return e;
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  const slugs = readFileSync(new URL('scripts/data/linkedin-editions.txt', root), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const posts = [];
  for (const s of slugs) {
    try { posts.push(parseArticle(await fetchArticle(s), `https://www.linkedin.com/pulse/${s}`)); }
    catch (e) { console.log(`  skipped ${e.message}`); }
  }
  console.log(`LinkedIn: ${posts.length} of ${slugs.length} articles read`);

  const e = env();
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(e.SUPABASE_URL || e.PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: articles, error } = await sb.from('articles').select('id, title, linkedin_url, published_at');
  if (error) throw new Error(error.message);
  const byTitle = new Map(articles.map((a) => [normTitle(a.title), a]));
  const byUrl = new Map(articles.filter((a) => a.linkedin_url).map((a) => [a.linkedin_url.split('?')[0], a]));
  const taken = new Set(articles.map((a) => a.id));

  const links = [], fresh = [], seenTitles = new Set();
  for (const p of posts) {
    // Some editions were retitled on the site, so a shared word or two within two days of each other also counts.
    const words = new Set(normTitle(p.title).split(' ').filter((w) => w.length > 3));
    const near = articles.find((a) => Math.abs(Date.parse(a.published_at) - Date.parse(p.date)) <= 2 * 864e5
      && normTitle(a.title).split(' ').filter((w) => words.has(w)).length >= 1);
    const hit = byUrl.get(p.url) || byTitle.get(normTitle(p.title)) || near;
    if (hit) { if (!hit.linkedin_url) links.push({ id: hit.id, url: p.url }); continue; }
    if (!p.md.trim() || !p.date) { console.log(`  no body or date, left out: ${p.url}`); continue; }
    const title = p.chapterTitle || p.title;
    const dup = seenTitles.has(normTitle(title));
    seenTitles.add(normTitle(title));
    const id = slugFor(title, taken);
    fresh.push({
      ...p, title, dup, id, dek: dekFrom(p.md),
      topic: p.chapter ? 'Health workforce' : TOPIC_FOR[id] || guessTopic(`${title} ${title} ${p.md}`),
      series: p.chapter ? SERIES : '', series_part: p.chapter,
    });
  }

  console.log(`Already on the site: ${posts.length - fresh.length} (${links.length} get their LinkedIn link)`);
  console.log(`To add: ${fresh.length}`);
  for (const f of fresh) console.log(`  ${f.date} ${f.topic.padEnd(26)} ${f.id}${f.dup ? '  (same title as another)' : ''}  ${f.md.split(/\s+/).length}w`);
  writeFileSync(new URL('scripts/data/linkedin-import.json', root), JSON.stringify(fresh.map(({ md, ...f }) => ({ ...f, words: md.split(/\s+/).length })), null, 2) + '\n');
  if (flag('--dry-run')) return console.log('Dry run: nothing written. Details in scripts/data/linkedin-import.json.');

  for (const l of links) {
    const { error: er } = await sb.from('articles').update({ linkedin_url: l.url }).eq('id', l.id);
    if (er) throw new Error(`${l.id}: ${er.message}`);
  }
  const rows = fresh.map((f) => ({
    id: f.id, title: f.title, dek: f.dek, topic: f.topic, series: f.series, series_part: f.series_part, published_at: f.date, status: flag('--publish') ? 'published' : 'draft',
    linkedin_url: f.url, body_md: (f.cover ? `![](${f.cover})\n\n` : '') + f.md, source: 'editor',
  }));
  const { error: e1 } = await sb.from('articles').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (e1) throw new Error(`articles: ${e1.message}`);
  const { error: e2 } = await sb.from('article_authors').upsert(rows.map((r) => ({ article_id: r.id, author_id: 'abel', position: 0 })), { onConflict: 'article_id,author_id', ignoreDuplicates: true });
  if (e2) throw new Error(`authors: ${e2.message}`);
  console.log(`Added ${rows.length} editions as ${flag('--publish') ? 'published' : 'drafts'}.`);
}

if (process.argv[1]?.endsWith('import-linkedin.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
