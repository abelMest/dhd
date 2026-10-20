// /contribute: pitch builder, the three submission forms and "your submissions" with review status.
import { useEffect, useState } from 'preact/hooks';
import { supabase, friendlyError } from '../lib/supabase';
import { TOPICS, PITCH_FORMATS, RESOURCE_TYPES, AUDIENCES, OPP_KINDS, COUNTRIES, STAGES, type Stage } from '../lib/taxonomy';
import { Fields, Notice, SignIn, useSession, missingRequired, fmtDay, type FieldDef, type Values } from './ui';

type Kind = 'pitch' | 'resource' | 'opportunity';
const FORMATS = PITCH_FORMATS.map((p) => p.format);

export const FORMS: Record<Kind, { title: string; intro: string; fields: FieldDef[] }> = {
  pitch: {
    title: 'Pitch a piece',
    intro: 'Tell us the idea first. If it fits, the editor invites a draft and works with you on it.',
    fields: [
      { name: 'title', label: 'Working title', required: true },
      { name: 'format', label: 'Format', type: 'select', options: FORMATS },
      { name: 'topic', label: 'Topic', type: 'select', options: TOPICS },
      { name: 'summary', label: 'Your argument or story', type: 'textarea', required: true, hint: 'Two to five sentences. What will readers know or be able to do afterwards?' },
      { name: 'whyNow', label: 'Why now', type: 'textarea', rows: 3 },
      { name: 'authorName', label: 'Your name', required: true },
      { name: 'authorRole', label: 'Role' },
      { name: 'authorOrg', label: 'Organisation' },
      { name: 'country', label: 'Country', type: 'select', options: COUNTRIES },
      { name: 'bio', label: 'Short bio', type: 'textarea', rows: 3, hint: 'Two lines, as it would appear under your piece.' },
      { name: 'contact', label: 'Best way to reach you', required: true, hint: 'Email or phone.' },
      { name: 'links', label: 'Links to past work', type: 'textarea', rows: 2 },
    ],
  },
  resource: {
    title: 'Suggest a resource',
    intro: 'A guide, standard, dataset, course or tool that people in digital health should know. An editor checks it before it appears.',
    fields: [
      { name: 'title', label: 'Title', required: true },
      { name: 'url', label: 'Link', type: 'url', required: true },
      { name: 'summary', label: 'What it is and who it helps', type: 'textarea', required: true, rows: 3 },
      { name: 'publisher', label: 'Publisher' },
      { name: 'topic', label: 'Topic', type: 'select', options: TOPICS },
      { name: 'type', label: 'Type', type: 'select', options: RESOURCE_TYPES },
      { name: 'countries', label: 'Countries', type: 'multi', options: ['Africa (regional)', 'Global', ...COUNTRIES.slice(2)] },
      { name: 'audience', label: 'Audience', type: 'multi', options: AUDIENCES },
    ],
  },
  opportunity: {
    title: 'Send an opportunity tip',
    intro: 'A fellowship, grant, job, call or training. An editor checks it against the source before it goes on the board.',
    fields: [
      { name: 'title', label: 'Title', required: true },
      { name: 'org', label: 'Organisation' },
      // Stored as oppKind so it can never overwrite the submission's own kind (the v6 bug).
      { name: 'oppKind', label: 'Type', type: 'select', options: OPP_KINDS },
      { name: 'url', label: 'Link to the official call', type: 'url', required: true },
      { name: 'deadline', label: 'Deadline', type: 'date' },
      { name: 'eligibility', label: 'Who can apply', type: 'textarea', rows: 2 },
    ],
  },
};

const PITCH_PATH: Stage[] = ['new', 'accepted', 'draft', 'in_review', 'approved', 'published'];

interface Submission {
  id: string; kind: Kind; payload: Values; status: Stage; editor_note: string; created_at: string;
  reviewed_at: string | null; draft_url: string; draft_text: string; draft_at: string | null; article_id: string | null;
}

function initialTab(): Kind {
  const h = location.hash.replace('#', '');
  return h === 'resource' ? 'resource' : h === 'tip' || h === 'opportunity' ? 'opportunity' : 'pitch';
}

export default function Contribute() {
  const sb = supabase();
  const session = useSession();
  const [tab, setTab] = useState<Kind>('pitch');
  const [values, setValues] = useState<Record<Kind, Values>>({ pitch: {}, resource: {}, opportunity: {} });
  const [mine, setMine] = useState<Submission[]>([]);
  const [msg, setMsg] = useState<{ kind: 'info' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Links like /contribute/#tip open the right form and bring it into view, on arrival or from a button on the page.
  useEffect(() => {
    const go = (scroll: boolean) => {
      setTab(initialTab());
      if (scroll && /^#(pitch|resource|tip|opportunity|forms)$/.test(location.hash)) document.getElementById('forms')?.scrollIntoView({ behavior: 'smooth' });
    };
    go(true);
    const onHash = () => go(true);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (session?.user.email) setValues((v) => ({ ...v, pitch: { contact: session.user.email, ...v.pitch } }));
    if (session) load();
  }, [session?.user.id]);

  async function load() {
    const { data, error } = await sb!.from('submissions').select('*').order('created_at', { ascending: false });
    if (error) setMsg({ kind: 'err', text: friendlyError(error) }); else setMine(data as Submission[]);
  }

  const set = (k: string, v: unknown) => setValues((all) => ({ ...all, [tab]: { ...all[tab], [k]: v } }));
  const switchTab = (k: Kind) => { setTab(k); setMsg(null); history.replaceState(null, '', k === 'opportunity' ? '#tip' : `#${k}`); };

  async function submit(e: Event) {
    e.preventDefault();
    const form = FORMS[tab];
    const missing = missingRequired(form.fields, values[tab]);
    if (missing.length) return setMsg({ kind: 'err', text: `Please fill in: ${missing.join(', ')}.` });
    setBusy(true); setMsg(null);
    const { error } = await sb!.from('submissions').insert({ kind: tab, payload: values[tab] });
    setBusy(false);
    if (error) return setMsg({ kind: 'err', text: friendlyError(error) });
    setValues((all) => ({ ...all, [tab]: tab === 'pitch' ? { contact: session?.user.email } : {} }));
    setMsg({ kind: 'info', text: tab === 'pitch' ? 'Pitch sent. Its status, and any note from the editor, shows below under Your submissions.' : 'Thank you. An editor will check it against the source.' });
    load();
  }

  return (
    <div>
      <PitchBuilder onContinue={(p) => { setValues((v) => ({ ...v, pitch: { ...v.pitch, ...p } })); switchTab('pitch'); document.getElementById('forms')?.scrollIntoView({ behavior: 'smooth' }); }} />

      <section id="forms" style="margin-top:56px;scroll-margin-top:90px">
        <div class="tabs" role="tablist" aria-label="What would you like to send?">
          {(Object.keys(FORMS) as Kind[]).map((k) => (
            <button type="button" role="tab" aria-selected={tab === k} onClick={() => switchTab(k)}>{FORMS[k].title}</button>
          ))}
        </div>
        <p class="tabBlurb">{FORMS[tab].intro}</p>

        {!sb ? (
          <Notice>Submissions open once the site is connected to its database. Until then, pitch the editor on <a href="https://www.linkedin.com/newsletters/digital-health-digest-7025355491115429888/">LinkedIn</a>.</Notice>
        ) : session === undefined ? (
          <p class="meta">Loading…</p>
        ) : session === null ? (
          <SignIn redirectPath={`/contribute/${location.hash}`} intro={<p>Sign in with your email to send this and follow its progress. We use your address only to reply about your submission.</p>} />
        ) : (
          <form class="panel" onSubmit={submit} noValidate>
            <h2 style="font-size:1.4rem">{FORMS[tab].title}</h2>
            <Fields defs={FORMS[tab].fields} values={values[tab]} set={set} />
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <div class="actions" style="justify-content:space-between;align-items:center;margin-top:8px">
              <button class="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
              <span class="meta">Signed in as {session.user.email} · <a href="#" onClick={(e) => { e.preventDefault(); sb.auth.signOut(); }}>Sign out</a></span>
            </div>
          </form>
        )}
      </section>

      {session && mine.length > 0 && (
        <section style="margin-top:56px">
          <h2>Your submissions</h2>
          <ul class="list">{mine.map((s) => <SubmissionRow s={s} onChange={load} />)}</ul>
        </section>
      )}
    </div>
  );
}

function PitchBuilder({ onContinue }: { onContinue: (v: Values) => void }) {
  const [format, setFormat] = useState<string>(FORMATS[0]);
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState('');
  const checklist = PITCH_FORMATS.find((p) => p.format === format)!.checklist;
  return (
    <section class="panel" aria-labelledby="pb-h">
      <h2 id="pb-h" style="font-size:1.5rem">Start a pitch in 20 seconds</h2>
      <p class="meta" style="margin-bottom:16px">Pick a format and a topic, add a working title, and carry it into the full pitch form.</p>
      <p class="label">Format</p>
      <div class="chips" style="margin:6px 0 16px">{FORMATS.map((f) => <button type="button" class="chip" aria-pressed={f === format} onClick={() => setFormat(f)}>{f}</button>)}</div>
      <p class="label">Topic</p>
      <div class="chips" style="margin:6px 0 16px">{TOPICS.map((t) => <button type="button" class="chip" aria-pressed={t === topic} onClick={() => setTopic(t)}>{t}</button>)}</div>
      <label class="field" for="pb-title"><span>Working title</span>
        <input id="pb-title" type="text" value={title} placeholder="What your piece argues, in a line" onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
      </label>
      <p class="label">A strong {format.toLowerCase()} pitch has</p>
      <ul style="margin:6px 0 18px;padding-left:1.2em">{checklist.map((c) => <li>{c}</li>)}</ul>
      <button class="btn" type="button" onClick={() => onContinue({ format, topic, title })}>Continue to the pitch form</button>
    </section>
  );
}

function SubmissionRow({ s, onChange }: { s: Submission; onChange: () => void }) {
  const stage = STAGES[s.status] || STAGES.new;
  const step = PITCH_PATH.indexOf(s.status);
  const canDraft = s.kind === 'pitch' && (s.status === 'accepted' || s.status === 'changes');
  const [draftUrl, setDraftUrl] = useState(s.draft_url);
  const [draftText, setDraftText] = useState(s.draft_text);
  const [err, setErr] = useState('');
  const sendDraft = async (e: Event) => {
    e.preventDefault();
    if (!draftUrl.trim() && !draftText.trim()) return setErr('Add a link to your draft or paste the text.');
    const { error } = await supabase()!.from('submissions').update({ draft_url: draftUrl, draft_text: draftText }).eq('id', s.id);
    if (error) setErr(friendlyError(error)); else onChange();
  };
  return (
    <li class="row">
      <div class="when">{fmtDay(s.created_at)}<br />{s.kind === 'pitch' ? 'Pitch' : s.kind === 'resource' ? 'Resource' : 'Opportunity'}</div>
      <div class="card">
        <h3 style="font-size:1.15rem">{String(s.payload.title || 'Untitled')}</h3>
        <div><span class={`pill ${stage.tone}`}>{stage.label}</span></div>
        {s.kind === 'pitch' && step >= 0 && (
          <ol class="progress" aria-label="Progress">
            {PITCH_PATH.map((p, i) => <li class={i <= step ? 'done' : ''}>{STAGES[p].label}</li>)}
          </ol>
        )}
        {s.editor_note && <p class="enbref" style="font-style:normal;margin-top:8px"><b>Note from the editor</b>{s.editor_note}</p>}
        {s.article_id && s.status === 'published' && <p><a href={`/editions/${s.article_id}/`}>Read your published piece →</a></p>}
        {canDraft && (
          <form onSubmit={sendDraft} style="margin-top:12px">
            <label class="field"><span>Link to your draft</span><input type="url" value={draftUrl} placeholder="Google Doc, Word Online, Dropbox…" onInput={(e) => setDraftUrl((e.target as HTMLInputElement).value)} /></label>
            <label class="field"><span>Or paste the text</span><textarea rows={6} value={draftText} onInput={(e) => setDraftText((e.target as HTMLTextAreaElement).value)} /></label>
            {err && <Notice kind="err">{err}</Notice>}
            <button class="btn sm" type="submit">Send draft</button>
          </form>
        )}
      </div>
    </li>
  );
}
