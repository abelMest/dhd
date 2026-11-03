// Anonymous, cookie-free counts (table public.clicks), shown in the console Overview:
//   page-view          every page a reader opens (ref = the page)
//   visit-<source>     once per visit, where the reader came from: linkedin, substack, google, search,
//                      social, email, other or direct (ref = the landing page)
//   home-view          once per visit that includes the home page
//   <data-count name>  clicks on links marked data-count="name" (the home page's hero cards)
// No cookies, IP addresses or personal data. Editors' own console pages are not counted.
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

function send(target: string) {
  if (!url || !key || navigator.webdriver) return;
  // keepalive lets the request finish while the browser moves to the next page.
  fetch(`${url}/rest/v1/clicks`, {
    method: 'POST', keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ target, ref: location.pathname.slice(0, 120) }),
  }).catch(() => {});
}

/** Once per browser session: true the first time, false after. Falls back to true if storage is blocked. */
function firstTime(flag: string) {
  try {
    if (sessionStorage.getItem(flag)) return false;
    sessionStorage.setItem(flag, '1');
  } catch { /* private mode: count it */ }
  return true;
}

/** Where this visit came from: a utm_source tag wins, then the referring site. */
export function visitSource(search: string, referrer: string, host: string) {
  const tag = new URLSearchParams(search).get('utm_source')?.toLowerCase() || '';
  let from = '';
  try { from = referrer ? new URL(referrer).hostname.toLowerCase() : ''; } catch { /* unreadable referrer */ }
  if (!tag && from && (from === host || from.endsWith(`.${host}`))) return 'internal';
  const s = tag || from;
  if (!s) return 'direct';
  if (/linkedin|lnkd\.in/.test(s)) return 'linkedin';
  if (/substack/.test(s)) return 'substack';
  if (/google/.test(s)) return 'google';
  if (/bing|duckduckgo|yahoo|ecosia|yandex|baidu|brave/.test(s)) return 'search';
  if (/facebook|fb\.|instagram|twitter|t\.co|x\.com|whatsapp|telegram|threads|bsky/.test(s)) return 'social';
  if (/mail|outlook|newsletter/.test(s)) return 'email';
  return 'other';
}

export function trackPage() {
  if (location.pathname.startsWith('/console')) return;
  send('page-view');
  const src = visitSource(location.search, document.referrer, location.hostname);
  if (src !== 'internal' && firstTime('dhd-visit')) send(`visit-${src}`);
}

export function trackHome() {
  if (firstTime('dhd-home-view')) send('home-view');
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLElement>('[data-count]');
    if (a) send(a.dataset.count!);
  }, { capture: true });
}
