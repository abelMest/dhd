// Small form building blocks shared by the contribute and console islands.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { supabase, friendlyError } from '../lib/supabase';
import { photoUrl, uploadLogo, uploadSquare } from '../lib/upload';

export type Values = Record<string, unknown>;
export type FieldDef = {
  name: string; label: string; type?: 'text' | 'email' | 'url' | 'date' | 'number' | 'textarea' | 'select' | 'multi' | 'checkbox' | 'markdown' | 'photo' | 'logo';
  options?: readonly string[]; required?: boolean; hint?: string; rows?: number; placeholder?: string;
};

export function Field({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${f.name}`;
  const label = <span>{f.label}{f.required && <span aria-hidden="true"> *</span>}</span>;
  const hint = f.hint && <small id={`${id}-hint`}>{f.hint}</small>;
  const common = { id, name: f.name, required: f.required, 'aria-describedby': f.hint ? `${id}-hint` : undefined, placeholder: f.placeholder };
  if (f.type === 'checkbox') {
    return (
      <label class="field" style="grid-template-columns:auto 1fr;align-items:center;gap:10px">
        <input type="checkbox" id={id} checked={!!value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
        {label}
      </label>
    );
  }
  if (f.type === 'photo' || f.type === 'logo') return <PhotoField f={f} value={String(value ?? '')} onChange={onChange} />;
  if (f.type === 'multi') {
    const vals = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset class="field" style="border:0;padding:0;margin:0 0 16px">
        <legend class="label" style="margin-bottom:6px">{f.label}</legend>
        <div class="chips">
          {f.options!.map((o) => (
            <button type="button" class="chip" aria-pressed={vals.includes(o)} onClick={() => onChange(vals.includes(o) ? vals.filter((x) => x !== o) : [...vals, o])}>{o}</button>
          ))}
        </div>
        {hint}
      </fieldset>
    );
  }
  return (
    <label class="field" for={id}>
      {label}
      {f.type === 'textarea' || f.type === 'markdown' ? (
        <textarea {...common} rows={f.rows || 5} value={String(value ?? '')} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
      ) : f.type === 'select' ? (
        <select {...common} value={String(value ?? '')} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
          <option value="">Choose…</option>
          {f.options!.map((o) => <option value={o}>{o}</option>)}
        </select>
      ) : (
        <>
          <input {...common} type={f.type || 'text'} value={String(value ?? '')} list={f.options?.length ? `${id}-list` : undefined}
            onInput={(e) => { const raw = (e.target as HTMLInputElement).value; onChange(f.type === 'number' ? Number(raw) : raw); }} />
          {/* Free text with suggestions, e.g. existing series names. */}
          {f.options?.length ? <datalist id={`${id}-list`}>{f.options.map((o) => <option value={o} />)}</datalist> : null}
        </>
      )}
      {hint}
    </label>
  );
}

/** A square portrait, stored as a path in the photos bucket. Editor console only. */
function PhotoField({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true); setErr('');
    try { onChange(f.type === 'logo' ? await uploadLogo(file, 'partner') : await uploadSquare(file, 'author')); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const src = photoUrl(value);
  return (
    <div class="field">
      <span>{f.label}</span>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        {f.type === 'logo'
          ? <span style="display:grid;place-items:center;min-width:160px;height:72px;padding:8px 14px;border-radius:12px;background:#0b1c2a">{src ? <img src={src} alt="" style="max-height:56px;max-width:220px" /> : <span class="meta" style="color:#cfd8df">No logo</span>}</span>
          : <span class="avatar" style="width:88px;height:88px">{src ? <img src={src} alt="" /> : 'No photo'}</span>}
        <label class="btn line">{busy ? 'Uploading…' : src ? `Replace ${f.type === 'logo' ? 'logo' : 'photo'}` : `Choose a ${f.type === 'logo' ? 'logo' : 'photo'}`}
          <input type="file" accept="image/*" class="sr" disabled={busy} onChange={(e) => pick((e.target as HTMLInputElement).files?.[0])} />
        </label>
        {src && !busy && <button type="button" class="btn line" onClick={() => onChange('')}>Remove</button>}
      </div>
      {f.hint && <small>{f.hint}</small>}
      {err && <Notice kind="err">{err}</Notice>}
    </div>
  );
}

export function Fields({ defs, values, set }: { defs: FieldDef[]; values: Values; set: (k: string, v: unknown) => void }) {
  return <>{defs.map((f) => <Field f={f} value={values[f.name]} onChange={(v) => set(f.name, v)} />)}</>;
}

export function missingRequired(defs: FieldDef[], values: Values) {
  return defs.filter((f) => f.required && !String(values[f.name] ?? '').trim()).map((f) => f.label);
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'err'; children: ComponentChildren }) {
  return <p class={`notice${kind === 'err' ? ' err' : ''}`} role={kind === 'err' ? 'alert' : 'status'}>{children}</p>;
}

/** Tracks the signed-in session. undefined while loading, null when signed out. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const sb = supabase();
    if (!sb) { setSession(null); return; }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Email magic-link sign-in. No passwords to remember or leak. */
export function SignIn({ intro, redirectPath }: { intro: ComponentChildren; redirectPath: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState('');
  const send = async (e: Event) => {
    e.preventDefault();
    setErr(''); setState('sending');
    const { error } = await supabase()!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + redirectPath } });
    if (error) { setErr(friendlyError(error)); setState('idle'); } else setState('sent');
  };
  if (state === 'sent') return <Notice>Check {email} for a sign-in link. It works once and expires in an hour. You can close this tab.</Notice>;
  return (
    <form class="panel" onSubmit={send}>
      {intro}
      <label class="field" for="signin-email"><span>Email address</span>
        <input id="signin-email" type="email" required autocomplete="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
      </label>
      {err && <Notice kind="err">{err}</Notice>}
      <button class="btn" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}</button>
    </form>
  );
}

export const fmtDay = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
