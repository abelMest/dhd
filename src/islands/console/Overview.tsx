// Console home: what needs the editor's attention today (mirrors the v6 overview).
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';
import { STAGES, type Stage } from '../../lib/taxonomy';
import { fmtDay, type Values } from '../ui';

type Go = (v: any, id?: string | null) => void;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// The home page's hero cards, in the order they sit on the page (see scripts/track.ts).
const CARDS = [
  { target: 'hero-latest', label: 'Latest edition' },
  { target: 'hero-essential', label: 'Essential read' },
  { target: 'hero-opportunity', label: 'Next deadline' },
];
type Counts = Record<string, { d7: number; d30: number }>;

export default function Overview({ go }: { go: Go }) {
  const sb = supabase()!;
  const [s, setS] = useState<{ subs: Values[]; drafts: Values[]; stale: Values[]; closing: Values[]; noTopic: Values[]; figuresAge: number | null; counts: Counts | null } | null>(null);

  useEffect(() => {
    (async () => {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString(), since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const [subs, drafts, opps, settings, clicks] = await Promise.all([
        sb.from('submissions').select('id,kind,status,payload,created_at,draft_at').order('created_at', { ascending: false }).limit(50),
        sb.from('articles').select('id,title,topic,published_at').eq('status', 'draft').order('published_at', { ascending: false }),
        sb.from('opportunities').select('id,title,deadline,verified_at,status').eq('status', 'published'),
        sb.from('settings').select('subscribers_updated_at').eq('id', 1).single(),
        sb.from('clicks').select('target,at').gte('at', since30).limit(20000),
      ]);
      let counts: Counts | null = null;
      if (!clicks.error) {
        counts = {};
        for (const c of (clicks.data as Values[]) || []) {
          const k = String(c.target), e = (counts[k] ||= { d7: 0, d30: 0 });
          e.d30++; if (String(c.at) >= since7) e.d7++;
        }
      }
      const stamped = (settings.data as Values | null)?.subscribers_updated_at;
      const o = (opps.data as Values[]) || [];
      const open = o.filter((x) => !x.deadline || String(x.deadline) >= today());
      setS({
        subs: ((subs.data as Values[]) || []).filter((x) => ['new', 'draft'].includes(String(x.status))),
        drafts: (drafts.data as Values[]) || [],
        noTopic: ((drafts.data as Values[]) || []).filter((x) => !x.topic),
        stale: open.filter((x) => !x.verified_at || String(x.verified_at) < plusDays(-30)),
        closing: open.filter((x) => x.deadline && String(x.deadline) <= plusDays(14)),
        figuresAge: stamped ? Math.floor((Date.parse(today()) - Date.parse(String(stamped))) / 86400000) : null,
        counts,
      });
    })();
  }, []);

  if (!s) return <p class="meta">Loading…</p>;
  const tiles = [
    { n: s.subs.length, label: 'Submissions waiting for you', go: () => go('submissions') },
    { n: s.drafts.length, label: 'Draft editions', go: () => go('articles') },
    { n: s.stale.length, label: 'Listings to re-check', go: () => go('opportunities') },
    { n: s.closing.length, label: 'Deadlines in the next 14 days', go: () => go('opportunities') },
  ];
  return (
    <section>
      <div class="tiles">
        {tiles.map((t) => (
          <button type="button" class="tile" onClick={t.go}><b class="num">{t.n}</b><span>{t.label}</span></button>
        ))}
      </div>
      {(s.figuresAge === null || s.figuresAge > 30) && (
        <p class="notice" style="margin-top:20px">
          {s.figuresAge === null ? 'Subscriber numbers have not been entered per platform yet.' : `Subscriber numbers were last updated ${s.figuresAge} days ago.`}{' '}
          Check LinkedIn and Substack and update them under <button type="button" class="linkBtn" onClick={() => go('settings')}>Settings & site text</button>.
        </p>
      )}
      {s.noTopic.length > 0 && (
        <p class="notice" style="margin-top:20px">{s.noTopic.length} new {s.noTopic.length === 1 ? 'edition was' : 'editions were'} imported from Substack. Add a topic, author and En bref, then set them to published.</p>
      )}
      {s.counts && (() => {
        const views = s.counts['home-view'] || { d7: 0, d30: 0 };
        const rate = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : '–');
        return (
          <div style="margin-top:32px">
            <h3>Home page cards</h3>
            <p class="meta">Clicks on the three cards beside the headline, counted without cookies. Click rate is clicks per home page visit.</p>
            <table class="dataTable">
              <thead><tr><th>Card</th><th>Clicks, 7 days</th><th>Clicks, 30 days</th><th>Click rate, 30 days</th></tr></thead>
              <tbody>
                {CARDS.map((c) => {
                  const n = s.counts![c.target] || { d7: 0, d30: 0 };
                  return <tr><td>{c.label}</td><td class="num">{n.d7}</td><td class="num">{n.d30}</td><td class="num">{rate(n.d30, views.d30)}</td></tr>;
                })}
                <tr><td><b>Home page visits</b></td><td class="num">{views.d7}</td><td class="num">{views.d30}</td><td></td></tr>
              </tbody>
            </table>
            <p class="meta">For all pages, countries and sources, open Cloudflare, Web Analytics, digitalhealthdigest.africa.</p>
          </div>
        );
      })()}
      <div class="grid2" style="margin-top:32px">
        <div>
          <h3>Latest submissions</h3>
          <ul class="list">
            {s.subs.slice(0, 6).map((x) => (
              <li class="crow"><button type="button" onClick={() => go('submissions')}><b>{String((x.payload as Values)?.title || 'Untitled')}</b><span class="meta">{x.kind as string} · {fmtDay(String(x.created_at))}</span></button><span class={`pill ${STAGES[x.status as Stage]?.tone}`}>{STAGES[x.status as Stage]?.label}</span></li>
            ))}
            {!s.subs.length && <li class="empty">Nothing waiting.</li>}
          </ul>
        </div>
        <div>
          <h3>Drafts</h3>
          <ul class="list">
            {s.drafts.slice(0, 6).map((x) => (
              <li class="crow"><button type="button" onClick={() => go('articles', String(x.id))}><b>{String(x.title)}</b><span class="meta">{String(x.topic || 'No topic yet')}</span></button></li>
            ))}
            {!s.drafts.length && <li class="empty">No drafts.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
