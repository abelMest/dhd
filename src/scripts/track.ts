// Anonymous counts for the home page (table public.clicks): one 'home-view' per visit, and a row whenever a
// link marked data-count="name" is clicked. No cookies or personal data; the console Overview shows the totals.
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

function send(target: string) {
  if (!url || !key || navigator.webdriver) return;
  // keepalive lets the request finish while the browser moves to the clicked page.
  fetch(`${url}/rest/v1/clicks`, {
    method: 'POST', keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ target, ref: location.pathname.slice(0, 120) }),
  }).catch(() => {});
}

export function trackHome() {
  try {
    if (!sessionStorage.getItem('dhd-home-view')) { sessionStorage.setItem('dhd-home-view', '1'); send('home-view'); }
  } catch { send('home-view'); }
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLElement>('[data-count]');
    if (a) send(a.dataset.count!);
  }, { capture: true });
}
