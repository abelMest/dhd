// Copies pictures that editions hot-link from LinkedIn (media.licdn.com) into Supabase Storage and points the
// editions at the copies. Many browsers block LinkedIn's image server as a tracker, so those pictures show blank.
//
//   node scripts/rehost-linkedin-images.mjs --dry-run   count what would change; write nothing
//   node scripts/rehost-linkedin-images.mjs             upload and rewrite (needs SUPABASE_URL and
//                                                       SUPABASE_SERVICE_ROLE_KEY, read from .env if not set)
// Every original → copy mapping is saved in scripts/data/linkedin-image-map.json, so the change can be undone.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const dry = process.argv.includes('--dry-run');
const root = new URL('../', import.meta.url);
const env = { ...process.env };
const ef = new URL('.env', root);
if (existsSync(ef)) for (const l of readFileSync(ef, 'utf8').split(/\r?\n/)) {
  const m = /^(\w+)=(.*)$/.exec(l); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const mapFile = new URL('scripts/data/linkedin-image-map.json', root);
const map = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};
const RE = /https:\/\/media\.licdn\.com\/[^)\s"'<>]+/g;

const { data: arts, error } = await sb.from('articles').select('id,body_md');
if (error) throw error;
const touched = arts.filter((a) => a.body_md.includes('https://media.licdn.com/'));
const urls = [...new Set(touched.flatMap((a) => a.body_md.match(RE)))];
console.log(`${touched.length} editions, ${urls.length} LinkedIn images (${urls.filter((u) => map[u]).length} already copied)`);
if (dry) process.exit(0);

let failed = 0;
for (const u of urls) {
  if (map[u]) continue;
  try {
    const r = await fetch(u.replace(/&amp;/g, '&'));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Pictures show at most 1280 wide on the site; re-encode as a reasonably sized JPEG.
    const img = await sharp(Buffer.from(await r.arrayBuffer())).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const path = `editions/li/${createHash('sha1').update(u).digest('hex').slice(0, 16)}.jpg`;
    const up = await sb.storage.from('photos').upload(path, img, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
    map[u] = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    writeFileSync(mapFile, JSON.stringify(map, null, 1));
  } catch (e) { failed++; console.warn(`could not copy ${u.slice(0, 80)}…: ${e.message}`); }
}

let changed = 0;
for (const a of touched) {
  const body = a.body_md.replace(RE, (u) => map[u] || u);
  if (body === a.body_md) continue;
  const { error: e } = await sb.from('articles').update({ body_md: body }).eq('id', a.id);
  if (e) { failed++; console.warn(`${a.id}: ${e.message}`); } else changed++;
}
console.log(`copied ${Object.keys(map).length} images, updated ${changed} editions, ${failed} problems`);
