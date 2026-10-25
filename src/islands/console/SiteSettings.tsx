// Site figures, every piece of homepage/About text, and the editor photo.
import { useEffect, useState } from 'preact/hooks';
import { supabase, friendlyError } from '../../lib/supabase';
import { COPY_DEFAULTS, type CopyKey } from '../../lib/copy';
import { Fields, Notice, type FieldDef, type Values } from '../ui';

// Money features: each stays hidden on the site until it is filled in.
const MONEY_FIELDS: FieldDef[] = [
  { name: 'contact_email', label: 'Partnership contact email', type: 'email', hint: 'Shown on Partner with us and the Privacy page. Use an address for the Digest, not an employer’s.' },
  { name: 'support_url', label: '“Support the Digest” link', type: 'url', hint: 'Your Substack paid-tier page, e.g. https://dhdigest.substack.com/subscribe. Adds a Support button to the footer and Partner page.' },
  { name: 'featured_price', label: 'Featured listing price', placeholder: 'US$150 for 30 days', hint: 'Shown on the Opportunities and Partner pages. Leave empty to show no price.' },
  { name: 'featured_payment_url', label: 'Featured listing payment link', type: 'url', hint: 'A Stripe, Paystack or similar payment link you create. After payment, set “Featured until” on the listing.' },
  { name: 'adsense_client', label: 'Google AdSense publisher ID', placeholder: 'ca-pub-1234567890123456', hint: 'From AdSense, Account, Account information. Adds the AdSense site tag and ads.txt.' },
  { name: 'adsense_slot_article', label: 'AdSense in-article unit ID', placeholder: '1234567890', hint: 'An “In-article” ad unit. Shown once, at a section break, in long editions.' },
  { name: 'adsense_slot_list', label: 'AdSense display unit ID', placeholder: '1234567890', hint: 'A “Display” ad unit. Shown once on the Opportunities board.' },
];

const SETTINGS_FIELDS: FieldDef[] = [
  { name: 'subscribers_linkedin', label: 'LinkedIn newsletter subscribers', type: 'number', hint: 'From your LinkedIn newsletter page. LinkedIn does not share this number, so it is entered here.' },
  { name: 'subscribers_substack', label: 'Substack subscribers', type: 'number', hint: 'From your Substack dashboard, Subscribers. Substack does not publish the exact number either.' },
  { name: 'linkedin_only_editions', label: 'Editions only on LinkedIn', type: 'number', hint: 'Published on LinkedIn but not on this site or Substack. The site counts its own editions and Substack posts by itself, and adds this.' },
  { name: 'substack_url', label: 'Substack address', type: 'url' },
  { name: 'show_french', label: 'Show the French “En bref” lines on the site', type: 'checkbox', hint: 'Off for now. Every edition keeps its French line in the console; switch this on to show them all again.' },
  { name: 'linkedin_url', label: 'LinkedIn newsletter address', type: 'url' },
];

// Grouped so the long list of text keys stays findable. Keys tied to retired v6 features are left out.
const COPY_GROUPS: { title: string; keys: CopyKey[] }[] = [
  { title: 'Homepage', keys: ['heroL1', 'heroRotate', 'heroL3', 'lede', 'statement', 'latestTitle', 'latestSub', 'pinsTitle', 'pinsSub', 'startTitle', 'startSub', 'topicsTitle', 'topicsSub', 'oppTitle', 'libTitle', 'libSub'] },
  { title: 'Subscribe and contribute', keys: ['subTitle', 'subSub', 'ctaTitle', 'ctaSub', 'builderTitle', 'builderSub'] },
  { title: 'About and standards', keys: ['aboutTitle', 'aboutName', 'aboutRoles', 'aboutBody', 'standardTitle', 'standard', 'partners'] },
  { title: 'Who reads the Digest', keys: ['readersAt', 'readersNote'] },
  { title: 'Announcement bar and footer', keys: ['announce', 'announceUrl', 'footerAbout'] },
  { title: 'Start here guide (/start/)', keys: ['startGuide'] },
];
const LABELS: Partial<Record<CopyKey, string>> = {
  heroL1: 'Headline, first words', heroRotate: 'Headline, emphasised words (first item is used)', heroL3: 'Headline, last word',
  lede: 'Introduction', statement: 'Statement (the paragraph that lights up as you scroll)', aboutRoles: 'Roles (one per line)', standard: 'Editorial standard (one commitment per line)',
  startGuide: 'Guide text in Markdown (## sections, ### the four paths, [links](https://…)). Clear the box to restore the original guide.',
  partners: 'Partners (one per line; list only organisations that agreed)',
  readersAt: 'Organisations readers work at (one per line). Shown as “Read by people at…” once there are at least three. List only places you know readers work, for example from LinkedIn newsletter analytics, Subscriber demographics, Companies.',
  readersNote: 'One line under the list about the fields readers work in (leave empty to hide)', announce: 'Announcement (leave empty to hide)', announceUrl: 'Announcement link',
};
const LONG = new Set<CopyKey>(['startGuide', 'lede', 'statement', 'aboutBody', 'aboutRoles', 'standard', 'partners', 'readersAt', 'readersNote', 'ctaSub', 'footerAbout', 'heroRotate']);

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
      // The date beside the subscriber numbers is stamped by the database when a number changes.
      const { id: _id, updated_at: _u, last_publish_at: _p, last_publish_by: _b, subscribers_updated_at: _d, ...row } = settings;
      for (const k of ['subscribers_linkedin', 'subscribers_substack']) if (!Number(row[k])) row[k] = null;   // empty = not known
      row.linkedin_only_editions = Math.max(0, Math.round(Number(row.linkedin_only_editions) || 0));
      // AdSense shows the ID as pub-…; the ad tag needs ca-pub-…
      const ad = String(row.adsense_client || '').trim();
      row.adsense_client = /^pub-/.test(ad) ? `ca-${ad}` : ad;
      for (const k of ['adsense_slot_article', 'adsense_slot_list']) row[k] = String(row[k] || '').replace(/\D/g, '');
      const s = await sb.from('settings').update(row).eq('id', 1);
      if (s.error) throw s.error;
      // Store only what differs from the built-in text; clearing a box restores the default.
      const keys = Object.keys(COPY_DEFAULTS) as CopyKey[];
      const keep = keys.filter((k) => k !== 'aboutPhoto' && String(copy[k] ?? '').trim()).map((k) => ({ key: k, value: String(copy[k]) }));
      const drop = keys.filter((k) => k !== 'aboutPhoto' && !String(copy[k] ?? '').trim());
      if (keep.length) { const r = await sb.from('site_copy').upsert(keep); if (r.error) throw r.error; }
      if (drop.length) { const r = await sb.from('site_copy').delete().in('key', drop); if (r.error) throw r.error; }
      const fresh = await sb.from('settings').select('*').eq('id', 1).single();
      if (fresh.data) setSettings(fresh.data);
      setMsg({ kind: 'info', text: 'Saved. The site updates by itself in about three minutes.' });
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
      setMsg({ kind: 'info', text: 'Photo saved. The site updates by itself in about three minutes.' });
    } catch (e) { setMsg({ kind: 'err', text: friendlyError(e) }); }
  }

  return (
    <form onSubmit={save} noValidate>
      <section class="panel">
        <h2 style="font-size:1.4rem">Site figures and links</h2>
        <Fields defs={SETTINGS_FIELDS} values={settings} set={(k, v) => setSettings((s) => ({ ...s, [k]: v }))} />
        <p class="meta" style="margin:-4px 0 16px">
          {(() => {
            const li = Number(settings.subscribers_linkedin) || 0, sub = Number(settings.subscribers_substack) || 0;
            if (!li && !sub) return 'Enter at least one subscriber number. Until then the site shows the older single figure.';
            const when = settings.subscribers_updated_at ? new Date(`${settings.subscribers_updated_at}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'this month';
            return `The site will show ${(li + sub).toLocaleString('en-GB')} subscribers, ${[li && 'LinkedIn', sub && 'Substack'].filter(Boolean).join(' + ')}, ${when}.`;
          })()}
        </p>
      </section>

      <section class="panel" style="margin-top:20px">
        <h2 style="font-size:1.4rem">Sponsors, support and ads</h2>
        <p class="meta" style="margin:-4px 0 16px">Each of these stays hidden on the site until you fill it in. Sponsors themselves are under Sponsors.</p>
        <Fields defs={MONEY_FIELDS} values={settings} set={(k, v) => setSettings((s) => ({ ...s, [k]: v }))} />
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
