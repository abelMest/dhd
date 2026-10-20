// After a production build on Cloudflare Pages, tells Bing, Yandex and other IndexNow engines what is new.
// Google does not use IndexNow; it reads the sitemap. Never fails the build.
import { readFileSync } from 'node:fs';

const KEY = '180d4f396abe0e9775f17ee1124d1000'; // public by design: the same value is served at /180d4f396abe0e9775f17ee1124d1000.txt
const site = (process.env.SITE_URL || 'https://digitalhealthdigest.africa').replace(/\/+$/, '');

if (process.env.CF_PAGES !== '1' || process.env.CF_PAGES_BRANCH !== 'main') {
  console.log('IndexNow: skipped (not a production build on Cloudflare Pages).');
  process.exit(0);
}
try {
  // Editions published in the last three days, plus the pages that list them.
  const rss = readFileSync('dist/rss.xml', 'utf8');
  const recent = [...rss.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<pubDate>([^<]+)<\/pubDate>/g)]
    .filter(([, , d]) => Date.now() - Date.parse(d) < 3 * 86400e3)
    .map(([, link]) => link);
  const urlList = [...new Set([`${site}/`, `${site}/editions/`, `${site}/opportunities/`, ...recent])];
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(site).host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList }),
    signal: AbortSignal.timeout(10000),
  });
  console.log(`IndexNow: sent ${urlList.length} URLs, status ${res.status}.`);
} catch (e) {
  console.log('IndexNow: could not notify (the build is fine):', e instanceof Error ? e.message : e);
}
