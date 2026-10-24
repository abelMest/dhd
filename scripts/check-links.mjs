// Checks every outside link in published editions and writes a report of the ones that fail.
//   node scripts/check-links.mjs [report.md]      (reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env)
// A link counts as broken on 404 or 410. Timeouts and other errors are listed separately: the site may only be
// unreachable from this network. Sites that block automated checks (403, 429, 999) are not reported.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = process.argv[2] || new URL('../broken-links.md', root);
const env = { ...process.env };
if (existsSync(new URL('.env', root))) for (const l of readFileSync(new URL('.env', root), 'utf8').split(/\r?\n/)) {
  const m = /^(\w+)=(.*)$/.exec(l); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: articles, error } = await sb.from('articles').select('id, title, body_md').eq('status', 'published');
if (error) throw new Error(error.message);

const links = [];
for (const a of articles) for (const m of a.body_md.matchAll(/(?<!!)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
  if (/^https:\/\/(media\.licdn\.com|substackcdn\.com|digitalhealthdigest\.africa)/.test(m[2])) continue;
  links.push({ id: a.id, title: a.title, text: m[1].replace(/\|/g, '/').slice(0, 70), url: m[2] });
}
const unique = [...new Set(links.map((l) => l.url))];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
async function check(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
      if (method === 'HEAD' && r.status >= 400) continue;
      if (/lnkd\.in$/.test(new URL(url).host) && /linkedin\.com\/(signup|authwall|login)|lnkd\.in/.test(r.url)) return 'Short link does not open the article';
      return r.status;
    } catch (e) { if (method === 'GET') return e.name === 'TimeoutError' ? 'No response' : 'No response'; }
  }
}
const status = new Map();
let i = 0;
await Promise.all(Array.from({ length: 10 }, async () => { while (i < unique.length) { const u = unique[i++]; status.set(u, await check(u)); } }));

const gone = links.filter((l) => [404, 410].includes(status.get(l.url)));
const short = links.filter((l) => typeof status.get(l.url) === 'string' && status.get(l.url).startsWith('Short'));
const down = links.filter((l) => status.get(l.url) === 'No response' || (typeof status.get(l.url) === 'number' && status.get(l.url) >= 500));
const row = (l) => `| [${l.title.slice(0, 60)}](https://digitalhealthdigest.africa/editions/${l.id}/) | ${l.text} | ${l.url.slice(0, 110)} | ${status.get(l.url)} |`;
const table = (ls) => ls.length ? `| Edition | Link text | Address | Status |\n|---|---|---|---|\n${ls.map(row).join('\n')}\n` : 'None.\n';
const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
writeFileSync(out, `# Broken links inside editions

Checked on ${day}: ${links.length} outside links (${unique.length} different addresses) in ${articles.length} published editions.

**To fix one:** console, Editions, open the edition, find the link text in *Full text*, replace the address (or remove the link), then **Save and update the site**.

## 1. Broken: the page is gone (${gone.length})

Replace with a working source (search the title, or an archived copy at web.archive.org), or remove the link.

${table(gone)}
## 2. LinkedIn short links that don't open (${short.length})

${table(short)}
## 3. Could not be reached from here (${down.length})

These did not load from my connection. They may be down or blocked on that network; open them from yours, and replace any that are really gone.

${table(down)}`);
console.log(`${links.length} links, ${unique.length} addresses: ${gone.length} gone, ${short.length} short links, ${down.length} unreachable. Report: ${out}`);
