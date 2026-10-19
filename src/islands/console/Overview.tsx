// Console home: what needs the editor's attention today (mirrors the v6 overview).
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';
import { STAGES, type Stage } from '../../lib/taxonomy';
import { fmtDay, type Values } from '../ui';

type Go = (v: any, id?: string | null) => void;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export default function Overview({ go }: { go: Go }) {
  const sb = supabase()!;
  const [s, setS] = useState<{ subs: Values[]; drafts: Values[]; stale: Values[]; closing: Values[]; noTopic: Values[] } | null>(null);

  useEffect(() => {
    (async () => {
      const [subs, drafts, opps] = await Promise.all([
        sb.from('submissions').select('id,kind,status,payload,created_at,draft_at').order('created_at', { ascending: false }).limit(50),
        sb.from('articles').select('id,title,topic,published_at').eq('status', 'draft').order('published_at', { ascending: false }),
        sb.from('opportunities').select('id,title,deadline,verified_at,status').eq('status', 'published'),
      ]);
      const o = (opps.data as Values[]) || [];
      const open = o.filter((x) => !x.deadline || String(x.deadline) >= today());
      setS({
        subs: ((subs.data as Values[]) || []).filter((x) => ['new', 'draft'].includes(String(x.status))),
        drafts: (drafts.data as Values[]) || [],
        noTopic: ((drafts.data as Values[]) || []).filter((x) => !x.topic),
        stale: open.filter((x) => !x.verified_at || String(x.verified_at) < plusDays(-30)),
        closing: open.filter((x) => x.deadline && String(x.deadline) <= plusDays(14)),
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
      {s.noTopic.length > 0 && (
        <p class="notice" style="margin-top:20px">{s.noTopic.length} new {s.noTopic.length === 1 ? 'edition was' : 'editions were'} imported from Substack. Add a topic, author and En bref, then set them to published.</p>
      )}
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
