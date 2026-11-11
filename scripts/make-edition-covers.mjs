// Gives editions the Digest's illustrated cover (scripts/covers/template.html) using the plan in scripts/covers/covers.json.
// The site uses an edition's first picture as its cover, so the new cover goes at the top of the body: it replaces a
// picture already there, or is added when the body has none at the top.
//
//   node scripts/make-edition-covers.mjs --render        render the covers to scripts/covers/out/ only
//   node scripts/make-edition-covers.mjs                 render, upload to Storage and swap them in
//   node scripts/make-edition-covers.mjs --only=id1,id2  limit to some editions
//   node scripts/make-edition-covers.mjs --restore       put every edition's original body back from the backup
// Original bodies are saved once in scripts/data/cover-backup.json before anything changes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const only = argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const root = new URL('../', import.meta.url);
const outDir = new URL('scripts/covers/out/', root);
mkdirSync(outDir, { recursive: true });
const plan = JSON.parse(readFileSync(new URL('scripts/covers/covers.json', root), 'utf8'));
const ids = Object.keys(plan).filter((id) => !only || only.includes(id));

const env = { ...process.env };
const ef = new URL('.env', root);
if (existsSync(ef)) for (const l of readFileSync(ef, 'utf8').split(/\r?\n/)) {
  const m = /^(\w+)=(.*)$/.exec(l); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sb = () => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const backupFile = new URL('scripts/data/cover-backup.json', root);
const backup = existsSync(backupFile) ? JSON.parse(readFileSync(backupFile, 'utf8')) : {};

if (flag('--restore')) {
  const db = sb(); let n = 0;
  for (const id of ids) if (backup[id] !== undefined) { const { error } = await db.from('articles').update({ body_md: backup[id] }).eq('id', id); if (error) console.warn(id, error.message); else n++; }
  console.log(`restored ${n} editions`); process.exit(0);
}

// 1. Render
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1456, height: 816 } });
await page.goto(new URL('scripts/covers/template.html', root).href);
await page.evaluate(() => document.fonts.ready);
for (const id of ids) {
  await page.evaluate((spec) => window.renderCover(spec), plan[id]);
  const png = await page.screenshot();
  writeFileSync(new URL(`${id}.jpg`, outDir), await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
}
await browser.close();
console.log(`rendered ${ids.length} covers to scripts/covers/out/`);
if (flag('--render')) process.exit(0);

// 2. Upload and swap
const db = sb();
const { data: arts, error } = await db.from('articles').select('id,body_md').in('id', ids);
if (error) throw error;
for (const a of arts) if (backup[a.id] === undefined) backup[a.id] = a.body_md;
writeFileSync(backupFile, JSON.stringify(backup, null, 1));
const version = Date.now().toString(36);
const LEAD = /^\s*(\[)?!\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)(\]\([^)]*\))?/;
let swapped = 0, added = 0, failed = 0;
for (const a of arts) {
  try {
    const file = readFileSync(new URL(`${a.id}.jpg`, outDir));
    const path = `editions/covers/${a.id}.jpg`;
    const up = await db.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
    const url = `${db.storage.from('photos').getPublicUrl(path).data.publicUrl}?v=${version}`;
    const original = backup[a.id];
    const body = LEAD.test(original)
      ? original.replace(LEAD, `![${''}](${url})`)
      : `![](${url})\n\n${original.trimStart()}`;
    LEAD.test(original) ? swapped++ : added++;
    const { error: e } = await db.from('articles').update({ body_md: body }).eq('id', a.id);
    if (e) throw e;
  } catch (e) { failed++; console.warn(`${a.id}: ${e.message}`); }
}
console.log(`covers replaced on ${swapped}, added to ${added}, ${failed} problems`);
