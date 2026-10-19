// Loads the v6 content (data/seed.json, a copy of digital-health-digest-v6/data/seed-v6.json) into Supabase.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-v6.mjs [--dry-run]
//
// The service-role key bypasses row-level security. Keep it in your local .env only; never put it in the site.
// Safe to run more than once: rows are upserted by id.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const dry = process.argv.includes('--dry-run');
const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const s = (v) => (v == null ? '' : String(v));
const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

export function transform(seed, on = today) {
  const authors = seed.authors.map((a) => {
    // v6 kept a Substack profile in the "linkedin" field.
    const url = s(a.linkedin);
    const isSubstack = /substack\.com/i.test(url);
    return {
      id: a.id, name: s(a.name), role: s(a.role), org: s(a.org), country: s(a.country), bio: s(a.bio),
      linkedin_url: isSubstack ? '' : url, substack_url: isSubstack ? url : '', is_editor: !!a.isEditor,
    };
  });
  const articles = seed.articles.map((a) => ({
    id: a.id, title: s(a.title), dek: s(a.dek), fr: s(a.fr), topic: s(a.topic), published_at: s(a.publishedAt),
    status: a.status === 'published' ? 'published' : 'draft', substack_url: s(a.substackUrl), linkedin_url: s(a.linkedinUrl),
    featured: !!a.featured, pinned: !!a.pinned, start_for: arr(a.startFor), read_mins: Number(a.readMins) || null,
    body_md: s(a.body), source: 'v6',
  }));
  const bylines = seed.articles.flatMap((a) => arr(a.authorIds).map((author_id, position) => ({ article_id: a.id, author_id, position })));
  const resources = (seed.resources || []).map((r) => ({
    id: r.id, title: s(r.title), url: s(r.url), summary: s(r.summary), publisher: s(r.publisher), year: s(r.year),
    topic: s(r.topic), type: s(r.type), countries: arr(r.countries), audience: arr(r.audience),
    status: r.status === 'pending' ? 'pending' : 'published', added_at: s(r.addedAt).slice(0, 10) || on,
  }));
  // Listings whose deadline has passed are not carried over.
  const live = (seed.opportunities || []).filter((o) => !o.deadline || o.deadline >= on);
  const skipped = (seed.opportunities || []).filter((o) => !live.includes(o)).map((o) => o.id);
  const opportunities = live.map((o) => ({
    id: o.id, title: s(o.title), org: s(o.org), kind: s(o.kind), url: s(o.url), deadline: o.deadline || null,
    eligibility: s(o.eligibility), countries: arr(o.countries), verified_at: o.verifiedAt || null,
    status: o.status === 'published' ? 'published' : 'pending',
  }));
  const notes = live.filter((o) => s(o.notes).trim()).map((o) => ({ opportunity_id: o.id, notes: s(o.notes) }));
  const site = seed.settings.find((x) => x.id === 'site') || {};
  const settings = {
    id: 1, subscribers: Number(site.subscribers) || 0, subscribers_label: s(site.subscribersLabel),
    editions_total: Number(site.editions) || 0, substack_url: s(site.substackUrl) || 'https://dhdigest.substack.com/',
    linkedin_url: s(site.linkedinUrl),
  };
  // Only store text that differs from the built-in defaults. "Drag through the Digest" named a v6 feature that is gone.
  const copyDoc = seed.settings.find((x) => x.id === 'copy') || {};
  const copy = Object.entries(copyDoc)
    .filter(([k, v]) => !['id', 'updatedAt'].includes(k) && typeof v === 'string' && v.trim())
    .filter(([k, v]) => !(k === 'latestTitle' && /drag/i.test(v)))
    .map(([key, value]) => ({ key, value }));
  return { authors, articles, bylines, resources, opportunities, notes, settings, copy, skipped };
}

async function main() {
  const data = transform(seed);
  console.log(`authors ${data.authors.length}, editions ${data.articles.length}, bylines ${data.bylines.length}, resources ${data.resources.length}, opportunities ${data.opportunities.length}, copy keys ${data.copy.length}`);
  if (data.skipped.length) console.log(`skipped closed opportunities: ${data.skipped.join(', ')}`);
  const missingBio = data.authors.filter((a) => !a.bio).map((a) => a.name);
  if (missingBio.length) console.log(`authors with no bio (add in Console → Authors): ${missingBio.join(', ')}`);
  if (dry) return;

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const put = async (table, rows, onConflict) => {
    if (!rows.length) return;
    const { error } = await sb.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  ${table}: ${rows.length}`);
  };
  await put('authors', data.authors, 'id');
  await put('articles', data.articles, 'id');
  await put('article_authors', data.bylines, 'article_id,author_id');
  await put('resources', data.resources, 'id');
  await put('opportunities', data.opportunities, 'id');
  await put('opportunity_notes', data.notes, 'opportunity_id');
  await put('settings', [data.settings], 'id');
  await put('site_copy', data.copy, 'key');
  console.log('Done.');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('import-v6.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
