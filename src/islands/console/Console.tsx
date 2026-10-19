// /console: the editor's workspace. Everything here is enforced again by the database rules,
// so hiding a button is a convenience, never the security.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase, friendlyError } from '../../lib/supabase';
import { renderMarkdown, readingMinutes } from '../../lib/markdown';
import { Fields, Notice, SignIn, useSession, missingRequired, fmtDay, type Values } from '../ui';
import { COLLECTIONS, VIRTUAL, slugify, type TableName } from './collections';
import Submissions from './Submissions';
import SiteSettings from './SiteSettings';
import Overview from './Overview';

type View = 'overview' | 'submissions' | TableName | 'settings';
const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'articles', label: 'Editions' },
  { id: 'authors', label: 'Authors' },
  { id: 'resources', label: 'Library' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'settings', label: 'Settings & site text' },
];

export default function Console() {
  const sb = supabase();
  const session = useSession();
  const [editor, setEditor] = useState<boolean | undefined>(undefined);
  const [view, setView] = useState<View>('overview');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const v = location.hash.slice(1) as View;
    if (VIEWS.some((x) => x.id === v)) setView(v);
  }, []);
  useEffect(() => {
    if (!session) { setEditor(undefined); return; }
    sb!.rpc('is_editor').then(({ data }) => setEditor(!!data));
  }, [session?.user.id]);

  const go = (v: View, id: string | null = null) => { setView(v); setOpenId(id); history.replaceState(null, '', `#${v}`); scrollTo(0, 0); };

  if (!sb) return <Notice>The console works once the site is connected to Supabase. Add PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY (see README) and rebuild.</Notice>;
  if (session === undefined) return <p class="meta">Loading…</p>;
  if (session === null) return <SignIn redirectPath="/console/" intro={<><h2 style="font-size:1.4rem">Editor sign-in</h2><p>We will email you a one-time sign-in link.</p></>} />;
  if (editor === undefined) return <p class="meta">Checking your access…</p>;
  if (!editor) {
    return (
      <Notice kind="err">
        {session.user.email} is not an editor. If you should be, ask an existing editor to promote your account (README, step 2). <a href="#" onClick={(e) => { e.preventDefault(); sb.auth.signOut(); }}>Sign out</a>
      </Notice>
    );
  }

  return (
    <div class="console">
      <div class="consoleBar">
        <nav class="tabs" aria-label="Console sections">
          {VIEWS.map((v) => <button type="button" aria-selected={view === v.id} onClick={() => go(v.id)}>{v.label}</button>)}
        </nav>
        <PublishButton />
      </div>
      {view === 'overview' && <Overview go={go} />}
      {view === 'submissions' && <Submissions openEdition={(id) => go('articles', id)} openNew={(table, prefill) => { go(table); setTimeout(() => window.dispatchEvent(new CustomEvent('console:new', { detail: prefill })), 0); }} />}
      {(view === 'articles' || view === 'authors' || view === 'resources' || view === 'opportunities') && (
        <CollectionView key={view} table={view} openId={openId} />
      )}
      {view === 'settings' && <SiteSettings />}
      <p class="meta" style="margin-top:40px">Signed in as {session.user.email} · <a href="#" onClick={(e) => { e.preventDefault(); sb.auth.signOut(); }}>Sign out</a></p>
    </div>
  );
}

function PublishButton() {
  const sb = supabase()!;
  const [last, setLast] = useState<{ at: string | null; by: string }>({ at: null, by: '' });
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState('');
  const load = () => sb.from('settings').select('last_publish_at,last_publish_by').eq('id', 1).single()
    .then(({ data }) => data && setLast({ at: data.last_publish_at, by: data.last_publish_by }));
  useEffect(() => { load(); }, []);
  const publish = async () => {
    setErr(''); setState('busy');
    const { error } = await sb.functions.invoke('publish', { method: 'POST' });
    if (error) { setErr(friendlyError(error)); setState('idle'); return; }
    setState('done'); load();
  };
  return (
    <div class="publish">
      <button class="btn brand" type="button" onClick={publish} disabled={state === 'busy'}>{state === 'busy' ? 'Starting…' : 'Publish site'}</button>
      <span class="meta">
        {state === 'done' ? 'Rebuilding. Changes are live in about two minutes.' : last.at ? `Last published ${new Date(last.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${last.by ? ` by ${last.by}` : ''}` : 'Not published from the console yet'}
      </span>
      {err && <Notice kind="err">{err}</Notice>}
    </div>
  );
}

function CollectionView({ table, openId }: { table: TableName; openId: string | null }) {
  const sb = supabase()!;
  const c = COLLECTIONS[table];
  const [rows, setRows] = useState<Values[]>([]);
  const [authors, setAuthors] = useState<Values[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ original: string | null; values: Values } | null>(null);
  const [err, setErr] = useState('');

  async function load() {
    let query = sb.from(table).select(table === 'articles' ? '*, article_authors(author_id, position)' : '*')
      .order(c.order.column, { ascending: c.order.ascending, nullsFirst: false });
    const { data, error } = await query;
    if (error) return setErr(friendlyError(error));
    setRows((data as unknown as Values[]).map((r) => table === 'articles'
      ? { ...r, authors: ((r.article_authors as Values[]) || []).sort((a, b) => Number(a.position) - Number(b.position)).map((x) => x.author_id) }
      : r));
    if (table === 'articles') {
      const { data: a } = await sb.from('authors').select('id,name').order('name');
      setAuthors((a as Values[]) || []);
    }
  }
  useEffect(() => { load(); }, [table]);
  useEffect(() => {
    if (openId && rows.length) { const r = rows.find((x) => x.id === openId); if (r) open(r); }
  }, [openId, rows.length]);
  useEffect(() => {
    const onNew = (e: Event) => setEditing({ original: null, values: { ...c.defaults(), ...(e as CustomEvent).detail } });
    window.addEventListener('console:new', onNew);
    return () => window.removeEventListener('console:new', onNew);
  }, [table]);

  async function open(r: Values) {
    const values = { ...r };
    delete values.article_authors;
    if (table === 'opportunities') {
      const { data } = await sb.from('opportunity_notes').select('notes').eq('opportunity_id', r.id).maybeSingle();
      values.notes = data?.notes || '';
    }
    setEditing({ original: String(r.id), values });
  }

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => words.every((w) => JSON.stringify([r.title, r.name, r.org, r.topic, r.dek]).toLowerCase().includes(w)));
  }, [rows, q]);

  if (editing) {
    const fields = c.fields.map((f) => (f.name === 'authors' ? { ...f, options: authors.map((a) => String(a.id)) } : f));
    return (
      <Editor
        table={table} fields={fields} initial={editing} authorNames={Object.fromEntries(authors.map((a) => [a.id, a.name]))}
        onClose={() => { setEditing(null); load(); }}
      />
    );
  }

  return (
    <section>
      <div class="secHead" style="margin-bottom:16px">
        <h2>{c.label}</h2>
        <button class="btn" type="button" onClick={() => setEditing({ original: null, values: c.defaults() })}>New {c.singular}</button>
      </div>
      <input type="search" placeholder={`Search ${c.label.toLowerCase()}`} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label={`Search ${c.label}`} />
      {err && <Notice kind="err">{err}</Notice>}
      <ul class="list" style="margin-top:16px">
        {shown.map((r) => {
          const st = c.state?.(r);
          return (
            <li class="crow">
              <button type="button" onClick={() => open(r)}>
                <b>{String(r.title || r.name)}</b>
                <span class="meta">{c.summary(r)}</span>
              </button>
              {st && <span class={`pill ${st.tone}`}>{st.label}</span>}
              {table === 'opportunities' && <VerifyToday id={String(r.id)} onDone={load} />}
            </li>
          );
        })}
        {!shown.length && <li class="empty">{rows.length ? 'Nothing matches that search.' : `No ${c.label.toLowerCase()} yet.`}</li>}
      </ul>
    </section>
  );
}

function VerifyToday({ id, onDone }: { id: string; onDone: () => void }) {
  const mark = async () => {
    const { error } = await supabase()!.from('opportunities').update({ verified_at: new Date().toISOString().slice(0, 10) }).eq('id', id);
    if (error) alert(friendlyError(error)); else onDone();
  };
  return <button class="btn line sm" type="button" onClick={mark} title="I checked this against the source today">Checked today</button>;
}

function Editor({ table, fields, initial, authorNames, onClose }: {
  table: TableName; fields: typeof COLLECTIONS[TableName]['fields']; initial: { original: string | null; values: Values };
  authorNames: Record<string, unknown>; onClose: () => void;
}) {
  const sb = supabase()!;
  const c = COLLECTIONS[table];
  const [v, setV] = useState<Values>(initial.values);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'err'; text: string } | null>(null);
  const isNew = initial.original === null;
  const hasId = fields.some((f) => f.name === 'id');

  const set = (k: string, val: unknown) => setV((cur) => {
    const next = { ...cur, [k]: val };
    // New editions and authors get a web address from the title or name until the editor types one.
    if (isNew && hasId && (k === 'title' || k === 'name') && (!cur.id || cur.id === slugify(String(cur[k] || '')))) next.id = slugify(String(val));
    return next;
  });

  // Show author names on the author chips rather than ids.
  const shownFields = fields.map((f) => (f.name === 'authors' ? { ...f, options: f.options, hint: Object.values(authorNames).length ? undefined : 'Add authors under Authors first.' } : f));

  async function save(e: Event) {
    e.preventDefault();
    const problems = [...missingRequired(c.fields, v).map((l) => `${l} is required.`), ...(c.validate?.(v) || [])];
    if (problems.length) return setMsg({ kind: 'err', text: problems.join(' ') });
    setBusy(true); setMsg(null);
    try {
      const row: Values = {};
      for (const f of c.fields) if (!(VIRTUAL[table] || []).includes(f.name)) row[f.name] = v[f.name] === '' && (f.type === 'date') ? null : v[f.name];
      if (table === 'articles') row.read_mins = v.body_md ? readingMinutes(String(v.body_md)) : (v.read_mins ?? null);
      if (!hasId && !isNew) row.id = initial.original;
      const res = isNew
        ? await sb.from(table).insert(row).select('id').single()
        : await sb.from(table).update(row).eq('id', initial.original!).select('id').single();
      if (res.error) throw res.error;
      const id = String(res.data.id);
      if (table === 'articles') {
        const ids = (v.authors as string[]) || [];
        const del = await sb.from('article_authors').delete().eq('article_id', id);
        if (del.error) throw del.error;
        if (ids.length) {
          const ins = await sb.from('article_authors').insert(ids.map((author_id, position) => ({ article_id: id, author_id, position })));
          if (ins.error) throw ins.error;
        }
      }
      if (table === 'opportunities') {
        const n = await sb.from('opportunity_notes').upsert({ opportunity_id: id, notes: String(v.notes || '') });
        if (n.error) throw n.error;
      }
      setMsg({ kind: 'info', text: 'Saved. Press Publish site when you are ready for it to go live.' });
      if (isNew) setTimeout(onClose, 600);
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) });
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Delete this ${c.singular} for good? This cannot be undone.`)) return;
    const { error } = await sb.from(table).delete().eq('id', initial.original!);
    if (error) setMsg({ kind: 'err', text: friendlyError(error) }); else onClose();
  }

  const body = String(v.body_md || '');
  return (
    <form class="panel" onSubmit={save} noValidate>
      <div class="secHead" style="margin-bottom:12px">
        <h2 style="font-size:1.5rem">{isNew ? `New ${c.singular}` : String(v.title || v.name || c.singular)}</h2>
        <button class="btn line sm" type="button" onClick={onClose}>← Back to {c.label.toLowerCase()}</button>
      </div>
      {table === 'articles' && !isNew && v.status === 'published' && <p class="meta"><a href={`/editions/${initial.original}/`} target="_blank">View on the site ↗</a></p>}
      {shownFields.map((f) => {
        if (f.type === 'markdown') {
          return (
            <div class="field">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span class="label">{f.label}</span>
                <span class="meta">{body ? `${readingMinutes(body)} min read` : ''} · <a href="#" onClick={(e) => { e.preventDefault(); setPreview(!preview); }}>{preview ? 'Edit' : 'Preview'}</a></span>
              </div>
              {preview
                ? <div class="prose mdPreview" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
                : <textarea rows={f.rows} value={body} onInput={(e) => set(f.name, (e.target as HTMLTextAreaElement).value)} style="font-family:ui-monospace,Consolas,monospace;font-size:.92rem" />}
              {f.hint && <small>{f.hint}</small>}
            </div>
          );
        }
        if (f.name === 'authors') {
          const vals = (v.authors as string[]) || [];
          return (
            <fieldset class="field" style="border:0;padding:0;margin:0 0 16px">
              <legend class="label" style="margin-bottom:6px">Authors</legend>
              <div class="chips">
                {Object.entries(authorNames).map(([id, name]) => (
                  <button type="button" class="chip" aria-pressed={vals.includes(id)} onClick={() => set('authors', vals.includes(id) ? vals.filter((x) => x !== id) : [...vals, id])}>{String(name)}</button>
                ))}
              </div>
              {f.hint && <small>{f.hint}</small>}
            </fieldset>
          );
        }
        return <Fields defs={[f]} values={v} set={set} />;
      })}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div class="actions" style="justify-content:space-between;margin-top:8px">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {!isNew && <button class="btn line" type="button" onClick={remove} style="color:var(--crit);border-color:var(--crit)">Delete</button>}
      </div>
      {!isNew && <p class="meta" style="margin-top:12px">Last changed {fmtDay(String(v.updated_at || ''))}</p>}
    </form>
  );
}
