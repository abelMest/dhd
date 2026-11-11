// Adds explanatory figures inside editions, in the Digest's illustrated style (scripts/covers/figure.html), from the
// plan in scripts/covers/figures.json. Each figure goes right after the paragraph that starts with its "after" text.
//
//   node scripts/make-edition-figures.mjs --render        render the figures to scripts/covers/out/figures/ only
//   node scripts/make-edition-figures.mjs                 render, upload to Storage and insert them
//   node scripts/make-edition-figures.mjs --only=id1,id2  limit to some editions
//   node scripts/make-edition-figures.mjs --restore       put back each edition's body from before its figures
// Bodies are saved once in scripts/data/figure-backup.json before anything changes. Running again replaces the
// figures rather than adding second copies.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const only = argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const root = new URL('../', import.meta.url);
const outDir = new URL('scripts/covers/out/figures/', root);
mkdirSync(outDir, { recursive: true });
const plan = JSON.parse(readFileSync(new URL('scripts/covers/figures.json', root), 'utf8'));
const ids = Object.keys(plan).filter((id) => !only || only.includes(id));

const env = { ...process.env };
const ef = new URL('.env', root);
if (existsSync(ef)) for (const l of readFileSync(ef, 'utf8').split(/\r?\n/)) {
  const m = /^(\w+)=(.*)$/.exec(l); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sb = () => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const backupFile = new URL('scripts/data/figure-backup.json', root);
const backup = existsSync(backupFile) ? JSON.parse(readFileSync(backupFile, 'utf8')) : {};

if (flag('--restore')) {
  const db = sb(); let n = 0;
  for (const id of ids) if (backup[id] !== undefined) { const { error } = await db.from('articles').update({ body_md: backup[id] }).eq('id', id); if (error) console.warn(id, error.message); else n++; }
  console.log(`restored ${n} editions`); process.exit(0);
}

/** Alt text that says what the figure shows, for screen readers and search. */
function alt(f) {
  const t = f.title.replace(/\.$/, '');
  if (f.type === 'points') return `${t}: ${f.items.map((i) => `${i.head}${i.text ? ` (${i.text.replace(/\.$/, '')})` : ''}`).join('; ')}.`;
  if (f.type === 'steps') return `${t}: ${f.steps.map((s, i) => `${i + 1}. ${s.head}${s.text ? `, ${s.text.replace(/\.$/, '')}` : ''}`).join('; ')}.`;
  if (f.type === 'compare') return `${t}. ${f.left.head}: ${f.left.items.join('; ')}. ${f.right.head}: ${f.right.items.join('; ')}.`;
  if (f.type === 'stat') return `${t}: ${f.value} ${f.label} ${f.bars.map((b) => `${b.label} ${b.value}%`).join(', ')}.`;
  return t;
}
const clean = (s) => s.replace(/[\[\]()]/g, '').replace(/\s+/g, ' ').trim();

// 1. Render
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1456, height: 816 } });
await page.goto(new URL('scripts/covers/figure.html', root).href);
await page.evaluate(() => document.fonts.ready);
for (const id of ids) for (const [i, f] of plan[id].entries()) {
  const r = await page.evaluate((spec) => window.renderFigure(spec), f);
  if (!r.fits) console.warn(`${id} figure ${i + 1}: ${r.over}px too tall; shorten its text`);
  writeFileSync(new URL(`${id}-${i + 1}.jpg`, outDir), await sharp(await page.screenshot()).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
}
await browser.close();
console.log(`rendered ${ids.reduce((n, id) => n + plan[id].length, 0)} figures to scripts/covers/out/figures/`);
if (flag('--render')) process.exit(0);

// 2. Upload and insert
const db = sb();
const { data: arts, error } = await db.from('articles').select('id,body_md').in('id', ids);
if (error) throw error;
for (const a of arts) if (backup[a.id] === undefined) backup[a.id] = a.body_md;
writeFileSync(backupFile, JSON.stringify(backup, null, 1));
const version = Date.now().toString(36);
let added = 0, failed = 0;
for (const a of arts) {
  // Start from the body as it was before any figures, so a re-run replaces them.
  const blocks = backup[a.id].split(/\n{2,}/);
  for (const [i, f] of plan[a.id].entries()) {
    try {
      const at = blocks.findIndex((b) => b.replace(/[*_>]/g, '').trim().startsWith(f.after));
      if (at < 0) throw new Error(`no paragraph starts with "${f.after}"`);
      const path = `editions/figures/${a.id}-${i + 1}.jpg`;
      const up = await db.storage.from('photos').upload(path, readFileSync(new URL(`${a.id}-${i + 1}.jpg`, outDir)), { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw up.error;
      const url = `${db.storage.from('photos').getPublicUrl(path).data.publicUrl}?v=${version}`;
      // A list ends at its last item; insert after the whole run of list lines that follows the anchor.
      let end = at;
      while (end + 1 < blocks.length && /^\s*(?:[-*]|\d+\.)\s/.test(blocks[end + 1]) && /^\s*(?:[-*]|\d+\.)\s/.test(blocks[at])) end++;
      blocks.splice(end + 1, 0, `![${clean(alt(f))}](${url})`);
      added++;
    } catch (e) { failed++; console.warn(`${a.id} figure ${i + 1}: ${e.message}`); }
  }
  const { error: e } = await db.from('articles').update({ body_md: blocks.join('\n\n') }).eq('id', a.id);
  if (e) { failed++; console.warn(`${a.id}: ${e.message}`); }
}
console.log(`inserted ${added} figures in ${arts.length} editions, ${failed} problems`);
