// /console: the editor's workspace. Everything here is enforced again by the database rules,
// so hiding a button is a convenience, never the security.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { supabase, friendlyError } from '../../lib/supabase';
import { renderMarkdown, readingMinutes } from '../../lib/markdown';
import { uploadFigure } from '../../lib/upload';
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
  { id: 'partners', label: 'Partners' },
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
        <PublishButton onOpen={(id) => go('articles', id)} />
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

function PublishButton({ onOpen }: { onOpen: (id: string) => void }) {
  const sb = supabase()!;
  const [last, setLast] = useState<{ at: string | null; by: string }>({ at: null, by: '' });
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState('');
  const [drafts, setDrafts] = useState<{ id: string; title: string }[]>([]);
  const load = () => {
    sb.from('settings').select('last_publish_at,last_publish_by').eq('id', 1).single()
      .then(({ data }) => data && setLast({ at: data.last_publish_at, by: data.last_publish_by }));
    // Drafts never go live through Publish site; say so before anyone wonders where an edition went.
    sb.from('articles').select('id,title').eq('status', 'draft').order('updated_at', { ascending: false })
      .then(({ data }) => setDrafts((data || []) as { id: string; title: string }[]));
  };
  useEffect(() => {
    load();
    window.addEventListener('console:saved', load);
    return () => window.removeEventListener('console:saved', load);
  }, []);
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
        {state === 'done' ? 'Rebuilding now. Changes are live in about two minutes.' : last.at ? `Last published ${new Date(last.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${last.by ? ` by ${last.by}` : ''}` : 'Not published from the console yet'}
      </span>
      <span class="meta">Saved changes go live by themselves about three minutes later. Use this to update now.</span>
      {drafts.length > 0 && (
        <p class="meta draftsWaiting" role="status">
          {drafts.length === 1 ? '1 edition is a draft' : `${drafts.length} editions are drafts`} and will not appear on the site:{' '}
          {drafts.slice(0, 3).map((d, i) => <>{i > 0 && ', '}<button type="button" class="linkBtn" onClick={() => onOpen(d.id)}>{d.title.length > 48 ? `${d.title.slice(0, 46)}…` : d.title}</button></>)}
          {drafts.length > 3 && ` and ${drafts.length - 3} more`}. Open one and choose <b>Save and publish</b>.
        </p>
      )}
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
    const editions: Edition[] = table === 'articles'
      ? rows.map((r) => ({ id: String(r.id), title: String(r.title || r.id), date: String(r.published_at || ''), status: String(r.status || '') }))
      : [];
    const seriesNames = [...new Set(rows.map((r) => String(r.series || '').trim()).filter(Boolean))].sort();
    const fields = c.fields.map((f) => (f.name === 'authors' ? { ...f, options: authors.map((a) => String(a.id)) } : f.name === 'series' ? { ...f, options: seriesNames } : f));
    return (
      <Editor
        table={table} fields={fields} initial={editing} authorNames={Object.fromEntries(authors.map((a) => [a.id, a.name]))} editions={editions}
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

type Edition = { id: string; title: string; date: string; status: string };

/** Puts rich text (and a plain fallback) on the clipboard, so it pastes into Substack with formatting. */
async function copyRich(html: string, plain: string) {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

/** Substack emails subscribers only when a post is published there. This hands over a ready-to-paste copy. */
function SendToSubstack({ id, title, dek, body }: { id: string; title: string; dek: string; body: string }) {
  const [substack, setSubstack] = useState('https://dhdigest.substack.com/');
  const [done, setDone] = useState('');
  useEffect(() => {
    supabase()!.from('settings').select('substack_url').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data?.substack_url) setSubstack(String(data.substack_url).replace(/\/*$/, '/')); });
  }, []);
  const url = `${location.origin}/editions/${id}/`;
  const copy = async (what: string, run: () => Promise<void>) => { await run(); setDone(what); setTimeout(() => setDone(''), 1800); };
  const bodyHtml = () => {
    // Links and images that point inside the site must be absolute once they leave it.
    const html = renderMarkdown(body).replace(/(href|src)="\/(?!\/)/g, `$1="${location.origin}/`);
    return `${html}<hr><p><em>This edition first appeared on <a href="${url}">Digital Health Digest</a>.</em></p>`;
  };
  return (
    <details class="panel" style="margin:0 0 20px">
      <summary style="cursor:pointer;font-weight:600">Send to subscribers through Substack</summary>
      <p class="meta" style="margin:10px 0">Substack emails your subscribers when you publish there. Publish here first, so the link back works, then:</p>
      <ol style="margin:0 0 12px;padding-left:20px;display:grid;gap:8px">
        <li><a href={`${substack}publish/post?type=newsletter`} target="_blank" rel="noopener">Open a new Substack post ↗</a></li>
        <li><button type="button" class="btn line sm" onClick={() => copy('title', () => navigator.clipboard.writeText(title))}>Copy title</button> and paste it as the Substack title.</li>
        {dek && <li><button type="button" class="btn line sm" onClick={() => copy('subtitle', () => navigator.clipboard.writeText(dek))}>Copy subtitle</button> and paste it as the subtitle.</li>}
        <li><button type="button" class="btn line sm" disabled={!body} onClick={() => copy('text', () => copyRich(bodyHtml(), `${body}\n\nThis edition first appeared on Digital Health Digest: ${url}`))}>Copy full text</button> and paste it into the body. Headings, links and images come with it.</li>
        <li>Publish it on Substack and choose to send it to your subscribers by email.</li>
      </ol>
      <p class="meta" role="status">{done ? `Copied the ${done}.` : ''}</p>
    </details>
  );
}

/** Search editions by title and pick one. Used for in-text links and for related editions. */
function EditionPicker({ editions, exclude = [], label, onPick, onClose }: {
  editions: Edition[]; exclude?: string[]; label: string; onPick: (e: Edition) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = editions
    .filter((e) => !exclude.includes(e.id) && words.every((w) => `${e.title} ${e.id}`.toLowerCase().includes(w)))
    .slice(0, 8);
  return (
    <div class="picker" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="search" autoFocus placeholder="Search editions by title" aria-label={label} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <button type="button" class="btn line sm" onClick={onClose}>Cancel</button>
      </div>
      <ul class="list" style="margin-top:8px">
        {hits.map((e) => (
          <li class="crow">
            <button type="button" onClick={() => onPick(e)}>
              <b>{e.title}</b>
              <span class="meta">{[e.date, e.status === 'published' ? '' : 'Draft: not live yet'].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
        {!hits.length && <li class="empty">No edition matches that.</li>}
      </ul>
    </div>
  );
}

function Editor({ table, fields, initial, authorNames, editions, onClose }: {
  table: TableName; fields: typeof COLLECTIONS[TableName]['fields']; initial: { original: string | null; values: Values };
  authorNames: Record<string, unknown>; editions: Edition[]; onClose: () => void;
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

  // Uploads a picture (scaled to 1600px wide) and drops a Markdown image at the cursor.
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [picking, setPicking] = useState<'' | 'link' | 'related'>('');
  // Links to another edition. Selected text becomes the link text; otherwise the edition's title does.
  function insertLink(name: string, e: Edition) {
    const text = String(v[name] ?? '');
    const el = bodyRef.current;
    const from = el?.selectionStart ?? text.length, to = el?.selectionEnd ?? from;
    const words = text.slice(from, to).trim() || e.title;
    set(name, `${text.slice(0, from)}[${words}](/editions/${e.id}/)${text.slice(to)}`);
    setPicking('');
  }
  const [imgBusy, setImgBusy] = useState(false);
  async function insertImage(name: string, file?: File) {
    if (!file) return;
    setImgBusy(true); setMsg(null);
    try {
      const url = await uploadFigure(file);
      const text = String(v[name] ?? '');
      const at = bodyRef.current?.selectionStart ?? text.length;
      set(name, `${text.slice(0, at)}

![Describe the image for readers who cannot see it](${url})

${text.slice(at)}`);
    } catch (err) { setMsg({ kind: 'err', text: friendlyError(err) }); } finally { setImgBusy(false); }
  }

  // publish = true (editions): save as published, then rebuild the site in the same click.
  async function save(e?: Event, publish = false) {
    e?.preventDefault();
    const w: Values = publish ? { ...v, status: 'published' } : v;
    const problems = [...missingRequired(c.fields, w).map((l) => `${l} is required.`), ...(c.validate?.(w) || [])];
    if (problems.length) return setMsg({ kind: 'err', text: problems.join(' ') });
    setBusy(true); setMsg(null);
    try {
      const row: Values = {};
      for (const f of c.fields) if (!(VIRTUAL[table] || []).includes(f.name)) row[f.name] = w[f.name] === '' && (f.type === 'date') ? null : w[f.name];
      if (table === 'articles') {
        row.read_mins = w.body_md ? readingMinutes(String(w.body_md)) : (w.read_mins ?? null);
        row.series = String(w.series || '').trim();
        row.series_part = row.series && Number(w.series_part) > 0 ? Math.round(Number(w.series_part)) : null;
        row.related = ((w.related as string[]) || []).slice(0, 3);
      }
      if (!hasId && !isNew) row.id = initial.original;
      const res = isNew
        ? await sb.from(table).insert(row).select('id').single()
        : await sb.from(table).update(row).eq('id', initial.original!).select('id').single();
      if (res.error) throw res.error;
      const id = String(res.data.id);
      if (table === 'articles') {
        const ids = (w.authors as string[]) || [];
        const del = await sb.from('article_authors').delete().eq('article_id', id);
        if (del.error) throw del.error;
        if (ids.length) {
          const ins = await sb.from('article_authors').insert(ids.map((author_id, position) => ({ article_id: id, author_id, position })));
          if (ins.error) throw ins.error;
        }
      }
      if (table === 'opportunities') {
        const n = await sb.from('opportunity_notes').upsert({ opportunity_id: id, notes: String(w.notes || '') });
        if (n.error) throw n.error;
      }
      window.dispatchEvent(new Event('console:saved'));
      if (publish) {
        setV(w);
        const pub = await sb.functions.invoke('publish', { method: 'POST' });
        if (pub.error) throw pub.error;
        window.dispatchEvent(new Event('console:saved'));
        setMsg({ kind: 'info', text: 'Published. The site is rebuilding and this edition is live in about two minutes.' });
      } else if (table === 'articles' && w.status !== 'published') {
        setMsg({ kind: 'info', text: 'Saved as a draft. It stays off the site until you choose Save and publish.' });
      } else {
        setMsg({ kind: 'info', text: 'Saved. The site updates by itself in about three minutes.' });
      }
      if (isNew && !publish) setTimeout(onClose, 600);
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
      {table === 'articles' && !isNew && v.status === 'published' && (
        <SendToSubstack id={String(initial.original)} title={String(v.title || '')} dek={String(v.dek || '')} body={String(v.body_md || '')} />
      )}
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
                : <>
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0">
                      <button type="button" class="btn line sm" aria-expanded={picking === 'link'} onClick={() => setPicking(picking === 'link' ? '' : 'link')}>Link to edition</button>
                      <label class="btn line sm">{imgBusy ? 'Uploading…' : 'Insert image'}
                        <input type="file" accept="image/*" class="sr" disabled={imgBusy} onChange={(e) => { const el = e.target as HTMLInputElement; insertImage(f.name, el.files?.[0]); el.value = ''; }} />
                      </label>
                      <small>Both go in where the cursor is. Select words first to turn them into the link. For an image, replace the words in [ ] with a short description.</small>
                    </div>
                    {picking === 'link' && <EditionPicker editions={editions} exclude={[String(v.id)]} label="Edition to link to" onPick={(e) => insertLink(f.name, e)} onClose={() => setPicking('')} />}
                    <textarea ref={bodyRef} rows={f.rows} value={body} onInput={(e) => set(f.name, (e.target as HTMLTextAreaElement).value)} style="font-family:ui-monospace,Consolas,monospace;font-size:.92rem" />
                  </>}
              {f.hint && <small>{f.hint}</small>}
            </div>
          );
        }
        if (f.name === 'related') {
          const vals = ((v.related as string[]) || []);
          const title = (id: string) => editions.find((e) => e.id === id)?.title || id;
          const move = (i: number) => { const n = [...vals]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set('related', n); };
          return (
            <fieldset class="field" style="border:0;padding:0;margin:0 0 16px">
              <legend class="label" style="margin-bottom:6px">{f.label}</legend>
              {vals.length > 0 && (
                <ol class="list" style="margin:0 0 8px">
                  {vals.map((id, i) => (
                    <li class="crow">
                      <span style="flex:1"><b>{i + 1}. {title(id)}</b></span>
                      {i > 0 && <button type="button" class="btn line sm" aria-label={`Move ${title(id)} up`} onClick={() => move(i)}>↑</button>}
                      <button type="button" class="btn line sm" aria-label={`Remove ${title(id)}`} onClick={() => set('related', vals.filter((x) => x !== id))}>Remove</button>
                    </li>
                  ))}
                </ol>
              )}
              {vals.length < 3 && (picking === 'related'
                ? <EditionPicker editions={editions} exclude={[String(v.id), ...vals]} label="Related edition" onPick={(e) => { set('related', [...vals, e.id]); setPicking(''); }} onClose={() => setPicking('')} />
                : <button type="button" class="btn line sm" onClick={() => setPicking('related')}>Add a related edition</button>)}
              {f.hint && <small style="display:block;margin-top:6px">{f.hint}</small>}
            </fieldset>
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
        <span style="display:flex;gap:10px;flex-wrap:wrap">
          {table === 'articles' && (
            <button class="btn brand" type="button" disabled={busy} onClick={() => save(undefined, true)}>
              {busy ? 'Working…' : v.status === 'published' ? 'Save and update the site' : 'Save and publish'}
            </button>
          )}
          <button class={table === 'articles' ? 'btn line' : 'btn'} type="submit" disabled={busy}>{busy ? 'Saving…' : table === 'articles' && v.status !== 'published' ? 'Save draft' : 'Save'}</button>
        </span>
        {!isNew && <button class="btn line" type="button" onClick={remove} style="color:var(--crit);border-color:var(--crit)">Delete</button>}
      </div>
      {!isNew && <p class="meta" style="margin-top:12px">Last changed {fmtDay(String(v.updated_at || ''))}</p>}
    </form>
  );
}
