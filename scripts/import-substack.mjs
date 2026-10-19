// Brings the full text of each edition over from the Substack RSS feed, as Markdown.
// Editions are matched by their Substack URL. Bodies that already exist are left alone unless you pass --overwrite.
//
//   node scripts/import-substack.mjs --seed           write bodies into data/seed.json (local builds, no Supabase)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-substack.mjs     write to Supabase
//
// Options: --overwrite      replace existing bodies
//          --create-drafts  add posts that are on Substack but not on the site as draft editions (Supabase only;
//                           the nightly job uses this, and the editor sets topic, author and En bref before publishing)
//          --feed <url or file>  (default https://dhdigest.substack.com/feed)
//          --dry-run        report matches only
// Read every imported edition once on the site before you announce it: conversion is good, not perfect.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);

export function normUrl(u) {
  try { const x = new URL(String(u).trim()); return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return ''; }
}

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*', hr: '---' });
// Substack chrome that is not part of the writing.
td.remove(['button', 'svg', 'form', 'script', 'style', 'source', 'input']);
td.addRule('substackWidgets', {
  filter: (n) => n.nodeType === 1 && /subscription-widget|subscribe-widget|button-wrapper|image-link-expand|footnote-anchor-|share-dialog|digest-post-embed|embedded-post/.test(n.getAttribute?.('class') || ''),
  replacement: () => '',
});
// Images: keep the picture and its caption, drop the lightbox link around it.
td.addRule('figure', {
  filter: 'figure',
  replacement: (_c, node) => {
    const img = node.querySelector('img');
    if (!img) return '';
    const cap = node.querySelector('figcaption')?.textContent?.trim() || '';
    const alt = (img.getAttribute('alt') || cap || '').replace(/[\[\]\n]/g, ' ').trim();
    return `\n\n![${alt}](${img.getAttribute('src')})${cap ? `\n*${cap}*` : ''}\n\n`;
  },
});
td.addRule('imageLink', {
  filter: (n) => n.nodeName === 'A' && n.querySelector?.('img') && !n.closest?.('figure'),
  replacement: (c) => c,
});

export function slugFromLink(link) {
  const m = /\/p\/([a-z0-9-]+)/i.exec(link);
  return (m ? m[1] : normUrl(link).replace(/[^a-z0-9]+/g, '-')).toLowerCase().replace(/^-+|-+$/g, '').slice(0, 80);
}

export function htmlToMarkdown(html) {
  return td.turndown(html || '')
    .replace(/ /g, ' ')
    // Substack wraps every list item in <p>, which turns into loose, padded lists.
    .replace(/^(\s*)([-*]|\d+\.)\s{2,}/gm, '$1$2 ')
    .replace(/\n[ \t]+\n(?=\s*([-*]|\d+\.) )/g, '\n')
    .replace(/(\n\s*(?:[-*]|\d+\.) [^\n]*)\n[ \t]*\n(?=[ \t]*(?:[-*]|\d+\.) )/g, '$1\n')
    // Headings are already bold.
    .replace(/^(#{1,6}) \*\*(.+?)\*\*[ \t]*$/gm, '$1 $2')
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*Thanks for reading[^\n]*\n?/gim, '')
    .trim() + '\n';
}

export function parseFeed(xml) {
  const doc = new XMLParser({ ignoreAttributes: false, cdataPropName: false }).parse(xml);
  const items = [].concat(doc?.rss?.channel?.item || []);
  return items.map((it) => ({
    title: String(it.title || ''),
    link: String(it.link || ''),
    pubDate: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : '',
    subtitle: String(it.description || ''),
    html: String(it['content:encoded'] || ''),
  }));
}

async function loadFeed(src) {
  if (existsSync(src)) return readFileSync(src, 'utf8');
  const r = await fetch(src, { headers: { 'User-Agent': 'DigitalHealthDigest-importer' } });
  if (!r.ok) throw new Error(`Feed ${src} returned ${r.status}`);
  return r.text();
}

async function main() {
  const posts = parseFeed(await loadFeed(opt('--feed', 'https://dhdigest.substack.com/feed')));
  const byUrl = new Map(posts.map((p) => [normUrl(p.link), p]));
  console.log(`Feed: ${posts.length} posts`);

  let articles, save, createDrafts = null;
  if (flag('--seed')) {
    const path = new URL('../data/seed.json', import.meta.url);
    const seed = JSON.parse(readFileSync(path, 'utf8'));
    articles = seed.articles.map((a) => ({ id: a.id, substackUrl: a.substackUrl, body: a.body || '' }));
    save = async (updates) => {
      for (const u of updates) seed.articles.find((a) => a.id === u.id).body = u.body;
      writeFileSync(path, JSON.stringify(seed, null, 2) + '\n');
    };
  } else {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --seed.');
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb.from('articles').select('id, substack_url, body_md');
    if (error) throw new Error(error.message);
    articles = data.map((a) => ({ id: a.id, substackUrl: a.substack_url, body: a.body_md || '' }));
    createDrafts = async (posts) => {
      const rows = posts.map((p) => ({
        id: slugFromLink(p.link), title: p.title, dek: p.subtitle.replace(/^By\s.+$/i, ''), topic: '', published_at: p.pubDate,
        status: 'draft', substack_url: p.link, body_md: htmlToMarkdown(p.html), source: 'substack',
      }));
      const { error: e } = await sb.from('articles').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (e) throw new Error(`drafts: ${e.message}`);
    };
    save = async (updates) => {
      for (const u of updates) {
        const { error: e } = await sb.from('articles').update({ body_md: u.body, read_mins: null }).eq('id', u.id);
        if (e) throw new Error(`${u.id}: ${e.message}`);
      }
    };
  }

  const updates = [], skipped = [], missing = [];
  for (const a of articles) {
    const p = byUrl.get(normUrl(a.substackUrl));
    if (!p) { if (a.substackUrl) missing.push(a.id); continue; }
    if (a.body.trim() && !flag('--overwrite')) { skipped.push(a.id); continue; }
    updates.push({ id: a.id, body: htmlToMarkdown(p.html) });
  }
  const known = new Set(articles.map((a) => normUrl(a.substackUrl)));
  const notInSite = posts.filter((p) => !known.has(normUrl(p.link)));

  for (const u of updates) console.log(`  ${u.id}: ${u.body.split(/\s+/).length} words`);
  if (skipped.length) console.log(`Kept existing bodies (use --overwrite to replace): ${skipped.join(', ')}`);
  if (missing.length) console.log(`Not in the feed (older posts drop out of it; paste these in the console): ${missing.join(', ')}`);
  if (notInSite.length) console.log(`On Substack but not on the site yet:\n${notInSite.map((p) => `  ${p.pubDate} ${p.title} ${p.link}`).join('\n')}`);
  if (flag('--dry-run')) return console.log('Dry run: nothing written.');
  await save(updates);
  console.log(`Wrote ${updates.length} bodies.`);
  if (flag('--create-drafts') && notInSite.length) {
    if (!createDrafts) return console.log('--create-drafts works with Supabase only; skipped.');
    await createDrafts(notInSite);
    console.log(`Created ${notInSite.length} draft editions. Review them in Console → Editions.`);
  }
}

if (process.argv[1]?.endsWith('import-substack.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
