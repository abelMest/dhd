// Saves this week's subscriber numbers to the site settings; the site then rebuilds itself.
//   node scripts/set-subscribers.mjs --linkedin 7590 --substack 486 [--dry-run]
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env. Either number may be left out.
// Refuses a number that falls by more than 10% from the saved one (usually a misread page); pass --force to save it anyway.
import { readFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const root = new URL('../', import.meta.url);
const env = { ...process.env };
if (existsSync(new URL('.env', root))) for (const l of readFileSync(new URL('.env', root), 'utf8').split(/\r?\n/)) {
  const m = /^(\w+)=(.*)$/.exec(l); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const next = {};
for (const [flag, col] of [['--linkedin', 'subscribers_linkedin'], ['--substack', 'subscribers_substack']]) {
  const raw = opt(flag);
  if (raw === undefined) continue;
  const n = Number(String(raw).replace(/[,\s]/g, ''));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a whole number, got "${raw}"`);
  next[col] = n;
}
if (!Object.keys(next).length) throw new Error('Pass --linkedin and/or --substack.');

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: now, error } = await sb.from('settings').select('subscribers_linkedin, subscribers_substack, subscribers_updated_at').eq('id', 1).single();
if (error) throw new Error(error.message);

for (const [col, n] of Object.entries(next)) {
  const old = Number(now[col]) || 0;
  console.log(`${col}: ${old || 'not set'} -> ${n}`);
  if (old && n < old * 0.9 && !argv.includes('--force')) throw new Error(`${col} fell from ${old} to ${n}. Check the page; pass --force if it is right.`);
}
if (argv.includes('--dry-run')) { console.log('Dry run: nothing saved.'); process.exit(0); }
const { error: e } = await sb.from('settings').update(next).eq('id', 1);
if (e) throw new Error(e.message);
const after = (await sb.from('settings').select('subscribers_linkedin, subscribers_substack, subscribers_updated_at').eq('id', 1).single()).data;
console.log(`Saved. Total ${(after.subscribers_linkedin || 0) + (after.subscribers_substack || 0)}, dated ${after.subscribers_updated_at}.`);
