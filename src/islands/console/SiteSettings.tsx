// Site figures, every piece of homepage/About text, and the editor photo.
import { useEffect, useState } from 'preact/hooks';
import { supabase, friendlyError } from '../../lib/supabase';
import { COPY_DEFAULTS, type CopyKey } from '../../lib/copy';
import { Fields, Notice, type FieldDef, type Values } from '../ui';

const SETTINGS_FIELDS: FieldDef[] = [
  { name: 'subscribers', label: 'Subscribers', type: 'number', hint: 'One verified number. Update it monthly.' },
  { name: 'subscribers_label', label: 'Source and date of that number', placeholder: 'LinkedIn + Substack, Oct 2026' },
  { name: 'editions_total', label: 'Editions published in total', type: 'number', hint: 'Including ones not yet on this site. The archive says "Showing N of this".' },
  { name: 'substack_url', label: 'Substack address', type: 'url' },
  { name: 'linkedin_url', label: 'LinkedIn newsletter address', type: 'url' },
];

// Grouped so the long list of text keys stays findable. Keys tied to retired v6 features are left out.
const COPY_GROUPS: { title: string; keys: CopyKey[] }[] = [
  { title: 'Homepage', keys: ['heroL1', 'heroRotate', 'heroL3', 'lede', 'statement', 'latestTitle', 'latestSub', 'pinsTitle', 'pinsSub', 'startTitle', 'startSub', 'topicsTitle', 'topicsSub', 'oppTitle', 'libTitle', 'libSub'] },
  { title: 'Subscribe and contribute', keys: ['subTitle', 'subSub', 'ctaTitle', 'ctaSub', 'builderTitle', 'builderSub'] },
  { title: 'About and standards', keys: ['aboutTitle', 'aboutName', 'aboutRoles', 'aboutBody', 'standardTitle', 'standard', 'partners'] },
  { title: 'Announcement bar and footer', keys: ['announce', 'announceUrl', 'footerAbout'] },
];
const LABELS: Partial<Record<CopyKey, string>> = {
  heroL1: 'Headline, first words', heroRotate: 'Headline, emphasised words (first item is used)', heroL3: 'Headline, last word',
  lede: 'Introduction', statement: 'Statement (the paragraph that lights up as you scroll)', aboutRoles: 'Roles (one per line)', standard: 'Editorial standard (one commitment per line)',
  partners: 'Partners (one per line; list only organisations that agreed)', announce: 'Announcement (leave empty to hide)', announceUrl: 'Announcement link',
};
const LONG = new Set<CopyKey>(['lede', 'statement', 'aboutBody', 'aboutRoles', 'standard', 'partners', 'ctaSub', 'footerAbout', 'heroRotate']);

export default function SiteSettings() {
  const sb = supabase()!;
  const [settings, setSettings] = useState<Values>({});
  const [copy, setCopy] = useState<Values>({});
  const [photo, setPhoto] = useState('');
  const [msg, setMsg] = useState<{ kind: 'info' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.from('settings').select('*').eq('id', 1).single().then(({ data }) => data && setSettings(data));
    sb.from('site_copy').select('key,value').then(({ data }) => {
      const c = Object.fromEntries(((data as Values[]) || []).map((r) => [r.key, r.value]));
      setCopy(c);
      if (c.aboutPhoto) setPhoto(publicUrl(String(c.aboutPhoto)));
    });
  }, []);

  const publicUrl = (path: string) => (/^(https?:|data:)/.test(path) ? path : `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/${path}`);

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const { id: _id, updated_at: _u, last_publish_at: _p, last_publish_by: _b, ...row } = settings;
      const s = await sb.from('settings').update(row).eq('id', 1);
      if (s.error) throw s.error;
      // Store only what differs from the built-in text; clearing a box restores the default.
      const keys = Object.keys(COPY_DEFAULTS) as CopyKey[];
      const keep = keys.filter((k) => k !== 'aboutPhoto' && String(copy[k] ?? '').trim()).map((k) => ({ key: k, value: String(copy[k]) }));
      const drop = keys.filter((k) => k !== 'aboutPhoto' && !String(copy[k] ?? '').trim());
      if (keep.length) { const r = await sb.from('site_copy').upsert(keep); if (r.error) throw r.error; }
      if (drop.length) { const r = await sb.from('site_copy').delete().in('key', drop); if (r.error) throw r.error; }
      setMsg({ kind: 'info', text: 'Saved. Press Publish site to put it live.' });
    } catch (e) { setMsg({ kind: 'err', text: friendlyError(e) }); } finally { setBusy(false); }
  }

  // Centre-crops to a 480px square JPEG before upload, as v6 did, so a phone photo never weighs megabytes.
  async function upload(file: File) {
    setMsg(null);
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height);
      const canvas = Object.assign(document.createElement('canvas'), { width: 480, height: 480 });
      canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 480, 480);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85));
      const name = `about-${Date.now()}.jpg`;
      const up = await sb.storage.from('photos').upload(name, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw up.error;
      const r = await sb.from('site_copy').upsert({ key: 'aboutPhoto', value: `photos/${name}` });
      if (r.error) throw r.error;
      setPhoto(publicUrl(`photos/${name}`));
      setMsg({ kind: 'info', text: 'Photo saved. Press Publish site to put it live.' });
    } catch (e) { setMsg({ kind: 'err', text: friendlyError(e) }); }
  }

  return (
    <form onSubmit={save} noValidate>
      <section class="panel">
        <h2 style="font-size:1.4rem">Site figures and links</h2>
        <Fields defs={SETTINGS_FIELDS} values={settings} set={(k, v) => setSettings((s) => ({ ...s, [k]: v }))} />
      </section>

      <section class="panel" style="margin-top:20px">
        <h2 style="font-size:1.4rem">Editor photo</h2>
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <div class="avatar" style="width:96px;height:96px">{photo ? <img src={photo} alt="" /> : 'No photo'}</div>
          <label class="btn line">Choose a photo<input type="file" accept="image/*" class="sr" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) upload(f); }} /></label>
        </div>
      </section>

      {COPY_GROUPS.map((g) => (
        <details class="panel" style="margin-top:20px">
          <summary><b>{g.title}</b></summary>
          <div style="margin-top:16px">
            <Fields
              defs={g.keys.map((k) => ({ name: k, label: LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), type: LONG.has(k) ? 'textarea' : 'text', rows: 3, placeholder: COPY_DEFAULTS[k], hint: 'Empty uses the default shown.' }))}
              values={copy} set={(k, v) => setCopy((c) => ({ ...c, [k]: v }))}
            />
          </div>
        </details>
      ))}

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div class="actions" style="margin-top:20px"><button class="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings and text'}</button></div>
    </form>
  );
}
