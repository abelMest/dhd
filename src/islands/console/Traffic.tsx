// Console Overview: site traffic from the cookie-free counter (table public.clicks, see scripts/track.ts).
// Visits per day, where visits come from, the most-read pages, and clicks on the home page's hero cards.
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';

type Row = { target: string; ref: string; at: string };
const DAY = 86400000;
// The home page's hero cards, in the order they sit on the page.
const CARDS = [
  { target: 'hero-latest', label: 'Latest edition' },
  { target: 'hero-essential', label: 'Essential read' },
  { target: 'hero-opportunity', label: 'Next deadline' },
];
const SOURCES: Record<string, string> = {
  linkedin: 'LinkedIn', substack: 'Substack', google: 'Google', search: 'Other search engines',
  social: 'Other social media', email: 'Email', other: 'Other websites', direct: 'Direct or unknown',
};
const PAGES: Record<string, string> = {
  '/': 'Home', '/start/': 'Start here', '/editions/': 'All editions', '/opportunities/': 'Opportunities', '/library/': 'Library',
  '/about/': 'About', '/contribute/': 'Contribute', '/partner/': 'Partner with us', '/search/': 'Search', '/privacy/': 'Privacy',
};

export default function Traffic() {
  const sb = supabase()!;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      // Supabase returns at most 1,000 rows per request, so read the month in pages.
      const all: Row[] = [];
      for (let from = 0; from < 100000; from += 1000) {
        const { data, error } = await sb.from('clicks').select('target,ref,at').gte('at', since).order('id').range(from, from + 999);
        if (error) { setFailed(true); return; }
        all.push(...(data as Row[]));
        if (!data || data.length < 1000) break;
      }
      const { data: arts } = await sb.from('articles').select('id,title');
      setTitles(Object.fromEntries((arts || []).map((a: any) => [`/editions/${a.id}/`, a.title])));
      setRows(all);
    })();
  }, []);

  if (failed) return null;
  if (!rows) return <p class="meta" style="margin-top:32px">Loading traffic…</p>;

  const now = Date.now(), cut7 = new Date(now - 7 * DAY).toISOString();
  const views = rows.filter((r) => r.target === 'page-view');
  const visits = rows.filter((r) => r.target.startsWith('visit-'));
  const n7 = (list: Row[]) => list.filter((r) => r.at >= cut7).length;

  // Visits per day, last 14 days (oldest first).
  const days = Array.from({ length: 14 }, (_, i) => new Date(now - (13 - i) * DAY).toISOString().slice(0, 10));
  const perDay = days.map((d) => ({ d, n: visits.filter((r) => r.at.slice(0, 10) === d).length }));
  const peak = Math.max(1, ...perDay.map((x) => x.n));

  const tally = (list: Row[], key: (r: Row) => string) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(key(r), (m.get(key(r)) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const sources = tally(visits, (r) => r.target.slice(6));
  const pages = tally(views, (r) => r.ref).slice(0, 10);
  const pageName = (p: string) => titles[p] || PAGES[p] || p;
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');

  const homeViews = rows.filter((r) => r.target === 'home-view').length;
  const startedAt = rows.length ? rows[0].at.slice(0, 10) : '';

  return (
    <div style="margin-top:32px">
      <h3>Traffic</h3>
      <p class="meta">Counted without cookies or personal data{startedAt ? `, last 30 days (page counts from ${startedAt})` : ''}. A visit is one reader session; it can include several pages.</p>
      <div class="tiles" style="margin-top:12px">
        <div class="tile static"><b class="num">{n7(visits)}</b><span>Visits, last 7 days</span></div>
        <div class="tile static"><b class="num">{visits.length}</b><span>Visits, last 30 days</span></div>
        <div class="tile static"><b class="num">{n7(views)}</b><span>Pages read, last 7 days</span></div>
        <div class="tile static"><b class="num">{views.length}</b><span>Pages read, last 30 days</span></div>
      </div>

      <h4 style="margin-top:24px">Visits per day, last 14 days</h4>
      <div class="dayBars" role="img" aria-label={perDay.map((x) => `${x.d}: ${x.n}`).join(', ')}>
        {perDay.map((x) => (
          <div class="dayBar" title={`${x.d}: ${x.n} visits`}>
            <span class="v">{x.n || ''}</span>
            <i style={`height:${Math.round((x.n / peak) * 100)}%`} />
            <span class="d">{x.d.slice(8)}</span>
          </div>
        ))}
      </div>

      <div class="grid2" style="margin-top:24px">
        <div>
          <h4>Where visits come from, 30 days</h4>
          <table class="dataTable">
            <thead><tr><th>Source</th><th>Visits</th><th>Share</th></tr></thead>
            <tbody>
              {sources.map(([s, n]) => <tr><td>{SOURCES[s] || s}</td><td class="num">{n}</td><td class="num">{pct(n, visits.length)}</td></tr>)}
              {!sources.length && <tr><td colSpan={3} class="meta">No visits counted yet.</td></tr>}
            </tbody>
          </table>
          <p class="meta">Add <code>?utm_source=linkedin</code> (or substack, email, whatsapp) to links you share, so visits from apps that hide where they came from are still counted correctly.</p>
        </div>
        <div>
          <h4>Most-read pages, 30 days</h4>
          <table class="dataTable">
            <thead><tr><th>Page</th><th>Reads</th></tr></thead>
            <tbody>
              {pages.map(([p, n]) => <tr><td><a href={p} target="_blank" rel="noopener">{pageName(p)}</a></td><td class="num">{n}</td></tr>)}
              {!pages.length && <tr><td colSpan={2} class="meta">No page reads counted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h4 style="margin-top:24px">Home page cards, 30 days</h4>
      <p class="meta">Clicks on the three cards beside the headline. Click rate is clicks per visit that included the home page.</p>
      <table class="dataTable">
        <thead><tr><th>Card</th><th>Clicks, 7 days</th><th>Clicks, 30 days</th><th>Click rate</th></tr></thead>
        <tbody>
          {CARDS.map((c) => {
            const list = rows.filter((r) => r.target === c.target);
            return <tr><td>{c.label}</td><td class="num">{n7(list)}</td><td class="num">{list.length}</td><td class="num">{pct(list.length, homeViews)}</td></tr>;
          })}
        </tbody>
      </table>
      <p class="meta">Cloudflare Web Analytics (dash.cloudflare.com, Web Analytics) also counts every visit, including readers who block scripts, and shows countries and devices.</p>
    </div>
  );
}
