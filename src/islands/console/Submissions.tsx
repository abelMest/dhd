// Reviewing what contributors send: pitches (and their drafts), resource suggestions and opportunity tips.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase, friendlyError } from '../../lib/supabase';
import { STAGES, type Stage } from '../../lib/taxonomy';
import { Notice, fmtDay, type Values } from '../ui';
import { FORMS } from '../Contribute';
import { slugify, type TableName } from './collections';

interface Sub {
  id: string; user_id: string; kind: 'pitch' | 'resource' | 'opportunity'; payload: Values; status: Stage;
  editor_note: string; draft_url: string; draft_text: string; draft_at: string | null; created_at: string;
  reviewed_at: string | null; article_id: string | null;
}
const FILTERS = [
  { id: 'action', label: 'Needs action', test: (s: Sub) => s.status === 'new' || s.status === 'draft' },
  { id: 'pitch', label: 'Pitches', test: (s: Sub) => s.kind === 'pitch' },
  { id: 'resource', label: 'Resources', test: (s: Sub) => s.kind === 'resource' },
  { id: 'opportunity', label: 'Opportunities', test: (s: Sub) => s.kind === 'opportunity' },
  { id: 'all', label: 'All', test: () => true },
];
const KIND_LABEL = { pitch: 'Pitch', resource: 'Resource', opportunity: 'Opportunity tip' };

export default function Submissions({ openEdition, openNew }: { openEdition: (id: string) => void; openNew: (t: TableName, prefill: Values) => void }) {
  const sb = supabase()!;
  const [subs, setSubs] = useState<Sub[]>([]);
  const [filter, setFilter] = useState('action');
  const [open, setOpen] = useState<Sub | null>(null);
  const [err, setErr] = useState('');

  const load = async () => {
    const { data, error } = await sb.from('submissions').select('*').order('created_at', { ascending: false });
    if (error) setErr(friendlyError(error)); else setSubs(data as Sub[]);
  };
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => subs.filter(FILTERS.find((f) => f.id === filter)!.test), [subs, filter]);

  if (open) return <Review s={open} onClose={() => { setOpen(null); load(); }} openEdition={openEdition} openNew={openNew} />;
  return (
    <section>
      <h2>Submissions</h2>
      <div class="chips" style="margin:12px 0 20px">
        {FILTERS.map((f) => (
          <button type="button" class="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} <span class="n">{subs.filter(f.test).length}</span></button>
        ))}
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      <ul class="list">
        {shown.map((s) => (
          <li class="crow">
            <button type="button" onClick={() => setOpen(s)}>
              <b>{String(s.payload.title || 'Untitled')}</b>
              <span class="meta">{KIND_LABEL[s.kind]} · {String(s.payload.authorName || s.payload.org || '')} · {fmtDay(s.created_at)}</span>
            </button>
            <span class={`pill ${STAGES[s.status].tone}`}>{STAGES[s.status].label}</span>
          </li>
        ))}
        {!shown.length && <li class="empty">Nothing here.</li>}
      </ul>
    </section>
  );
}

function Review({ s, onClose, openEdition, openNew }: { s: Sub; onClose: () => void; openEdition: (id: string) => void; openNew: (t: TableName, p: Values) => void }) {
  const sb = supabase()!;
  const [note, setNote] = useState(s.editor_note);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'err'; text: string } | null>(null);
  const p = s.payload;

  const setStatus = async (status: Stage, extra: Values = {}) => {
    setBusy(true); setMsg(null);
    const { error } = await sb.from('submissions').update({ status, editor_note: note, reviewed_at: new Date().toISOString(), ...extra }).eq('id', s.id);
    setBusy(false);
    if (error) setMsg({ kind: 'err', text: friendlyError(error) }); else onClose();
  };

  // Pitch → draft edition: match the author by name or create them, then open the new draft in the editor.
  const toEdition = async () => {
    setBusy(true); setMsg(null);
    try {
      const name = String(p.authorName || '').trim();
      let authorId = '';
      if (name) {
        const { data: found } = await sb.from('authors').select('id').ilike('name', name).maybeSingle();
        authorId = found?.id || '';
        if (!authorId) {
          authorId = slugify(name) || `author-${Date.now()}`;
          const { error } = await sb.from('authors').insert({ id: authorId, name, role: p.authorRole || '', org: p.authorOrg || '', country: p.country || '', bio: p.bio || '' });
          if (error) throw error;
        }
      }
      let id = slugify(String(p.title || 'untitled'));
      const { data: clash } = await sb.from('articles').select('id').eq('id', id).maybeSingle();
      if (clash) id = `${id}-${Date.now().toString(36).slice(-4)}`;
      const { error } = await sb.from('articles').insert({
        id, title: p.title, dek: p.summary || '', topic: p.topic || '', published_at: new Date().toISOString().slice(0, 10),
        status: 'draft', body_md: s.draft_text || '', source: 'submission', submission_id: s.id,
      });
      if (error) throw error;
      if (authorId) await sb.from('article_authors').insert({ article_id: id, author_id: authorId, position: 0 });
      await sb.from('submissions').update({ status: 'approved', article_id: id, editor_note: note, reviewed_at: new Date().toISOString() }).eq('id', s.id);
      openEdition(id);
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) });
      setBusy(false);
    }
  };

  const fields = FORMS[s.kind].fields;
  return (
    <section class="panel">
      <div class="secHead" style="margin-bottom:12px">
        <div><p class="kicker">{KIND_LABEL[s.kind]} · received {fmtDay(s.created_at)}</p><h2 style="font-size:1.5rem">{String(p.title || 'Untitled')}</h2></div>
        <button class="btn line sm" type="button" onClick={onClose}>← Back</button>
      </div>
      <p><span class={`pill ${STAGES[s.status].tone}`}>{STAGES[s.status].label}</span></p>
      <dl class="facts">
        {fields.filter((f) => f.name !== 'title' && p[f.name] && String(p[f.name]).length).map((f) => (
          <><dt>{f.label}</dt><dd>{Array.isArray(p[f.name]) ? (p[f.name] as string[]).join(', ') : /^https?:/.test(String(p[f.name])) ? <a href={String(p[f.name])} target="_blank" rel="noopener">{String(p[f.name])}</a> : String(p[f.name])}</dd></>
        ))}
      </dl>
      {(s.draft_url || s.draft_text) && (
        <div class="enbref" style="font-style:normal">
          <b>Draft received {fmtDay(s.draft_at)}</b>
          {s.draft_url && <p><a href={s.draft_url} target="_blank" rel="noopener">{s.draft_url}</a></p>}
          {s.draft_text && <details><summary>Read the pasted draft ({s.draft_text.split(/\s+/).length} words)</summary><div style="white-space:pre-wrap;margin-top:8px">{s.draft_text}</div></details>}
        </div>
      )}
      <label class="field" style="margin-top:20px"><span>Note to the contributor</span>
        <textarea rows={3} value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} placeholder="They see this next to the status." />
      </label>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div class="actions">
        {s.kind === 'pitch' && <>
          {s.status === 'new' && <button class="btn" disabled={busy} onClick={() => setStatus('accepted')}>Accept and invite a draft</button>}
          {(s.status === 'draft' || s.status === 'in_review') && <button class="btn" disabled={busy} onClick={() => setStatus('in_review')}>Mark in review</button>}
          {s.status !== 'new' && s.status !== 'declined' && <button class="btn line" disabled={busy} onClick={() => setStatus('changes')}>Request changes</button>}
          {!s.article_id && s.status !== 'new' && s.status !== 'declined' && <button class="btn brand" disabled={busy} onClick={toEdition}>Approve and create draft edition</button>}
          {s.article_id && <button class="btn line" onClick={() => openEdition(s.article_id!)}>Open the edition</button>}
          {s.article_id && s.status !== 'published' && <button class="btn line" disabled={busy} onClick={() => setStatus('published')}>Mark published</button>}
        </>}
        {s.kind === 'resource' && s.status !== 'added' && (
          <button class="btn" disabled={busy} onClick={async () => { await setStatus('added'); openNew('resources', { title: p.title, url: p.url, summary: p.summary, publisher: p.publisher, topic: p.topic, type: p.type, countries: p.countries || [], audience: p.audience || [], status: 'published' }); }}>Add to the library</button>
        )}
        {s.kind === 'opportunity' && s.status !== 'added' && (
          <button class="btn" disabled={busy} onClick={async () => { await setStatus('added'); openNew('opportunities', { title: p.title, org: p.org, kind: p.oppKind, url: p.url, deadline: p.deadline || null, eligibility: p.eligibility, countries: [], status: 'pending' }); }}>Add to the board (unverified)</button>
        )}
        {s.status !== 'declined' && s.status !== 'published' && s.status !== 'added' && <button class="btn line" disabled={busy} onClick={() => setStatus('declined')} style="color:var(--crit);border-color:var(--crit)">Decline</button>}
        <button class="btn line" disabled={busy} onClick={() => setStatus(s.status)}>Save note only</button>
      </div>
    </section>
  );
}
