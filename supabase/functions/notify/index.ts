// Edge function: emails a contributor when an editor changes the status of their submission (or leaves a note).
// Called from /console → Submissions after the status is saved. Sends through Resend (resend.com).
//
// Deploy:  supabase functions deploy notify
// Secrets: supabase secrets set RESEND_API_KEY=re_...                      (from resend.com → API Keys)
//          supabase secrets set EMAIL_FROM="Digital Health Digest <editor@digitalhealthdigest.africa>"
//          supabase secrets set EMAIL_REPLY_TO=contact@digitalhealthdigest.africa   (optional)
//          SITE_ORIGIN is shared with the publish function.
import { createClient } from 'npm:@supabase/supabase-js@2';

const allowed = (Deno.env.get('SITE_ORIGIN') || '').split(',').map((o) => o.trim()).filter(Boolean);
const site = (allowed[0] || 'https://digitalhealthdigest.africa').replace(/\/$/, '');
let cors: Record<string, string> = {};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Sub = { id: string; user_id: string; kind: string; status: string; editor_note: string; article_id: string | null; payload: Record<string, unknown> };

/** Subject and opening paragraph for each status. Statuses not listed send nothing (unless it is a note). */
function message(s: Sub, noteOnly: boolean): { subject: string; lead: string; action?: [string, string] } | null {
  const title = String(s.payload.title || 'your submission');
  const what = s.kind === 'pitch' ? (s.payload.story ? 'story' : 'pitch') : s.kind === 'resource' ? 'resource suggestion' : 'opportunity tip';
  const track: [string, string] = ['See it on your contributor page', `${site}/contribute/`];
  if (noteOnly) return { subject: `A note from the editor about "${title}"`, lead: `The editor has left a note about your ${what}, "${title}".`, action: track };
  switch (s.status) {
    case 'accepted': return { subject: `Your ${what} was accepted: "${title}"`, lead: `Good news: your ${what}, "${title}", has been accepted, and the editor would like you to send a draft. Sign in on your contributor page to add a link to your draft or paste the text.`, action: ['Send your draft', `${site}/contribute/`] };
    case 'changes': return { subject: `Changes requested: "${title}"`, lead: `The editor has reviewed "${title}" and asked for some changes. You can send an updated draft from your contributor page.`, action: ['Update your draft', `${site}/contribute/`] };
    case 'approved': return { subject: `Approved: "${title}"`, lead: `"${title}" has been approved. The editor is preparing it for publication and will be in touch if anything else is needed.`, action: track };
    case 'published': return { subject: `Now live: "${title}"`, lead: `"${title}" is now published on Digital Health Digest. Thank you for writing for us. Please share it with your network.`, action: s.article_id ? ['Read it on the Digest', `${site}/editions/${s.article_id}/`] : track };
    case 'added': return { subject: `Thank you: "${title}" is on the Digest`, lead: `Thank you for your ${what}. "${title}" has been checked and added to the Digest.`, action: [s.kind === 'resource' ? 'See the library' : 'See the opportunity board', `${site}/${s.kind === 'resource' ? 'library' : 'opportunities'}/`] };
    case 'declined': return { subject: `About your ${what}: "${title}"`, lead: `Thank you for sending "${title}". After review, the editor has decided not to take it forward this time. We hope you will send us another idea.`, action: track };
    default: return null;
  }
}

function html(name: string, m: NonNullable<ReturnType<typeof message>>, note: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;color:#0b1c2a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#071a29;padding:18px 28px;font-family:Arial,sans-serif;font-weight:700;letter-spacing:2px;font-size:13px;color:#ffffff;text-transform:uppercase">Digital Health Digest</td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 16px;font-size:17px">Dear ${esc(name)},</p>
      <p style="margin:0 0 16px;font-size:17px;line-height:1.55">${esc(m.lead)}</p>
      ${note ? `<div style="margin:0 0 20px;padding:14px 16px;background:#eef6fc;border-left:3px solid #298fc9;font-size:16px;line-height:1.5"><b style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#136396">Note from the editor</b><br>${esc(note).replace(/\n/g, '<br>')}</div>` : ''}
      ${m.action ? `<p style="margin:0 0 24px"><a href="${esc(m.action[1])}" style="display:inline-block;background:#136396;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;padding:12px 20px;border-radius:8px">${esc(m.action[0])}</a></p>` : ''}
      <p style="margin:0;font-size:16px;line-height:1.5">With thanks,<br>The Digital Health Digest editors</p>
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #e3e8ec;font-family:Arial,sans-serif;font-size:12px;color:#5b6b78">You are receiving this because you sent a submission to Digital Health Digest. Reply to this email to reach the editor.</td></tr>
  </table></body></html>`;
}

function text(name: string, m: NonNullable<ReturnType<typeof message>>, note: string) {
  return [`Dear ${name},`, m.lead, note ? `Note from the editor:\n${note}` : '', m.action ? `${m.action[0]}: ${m.action[1]}` : '', 'With thanks,\nThe Digital Health Digest editors']
    .filter(Boolean).join('\n\n');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  cors = {
    'Access-Control-Allow-Origin': !allowed.length ? '*' : allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: user } = await asUser.auth.getUser();
  if (!user?.user) return json({ error: 'Sign in first.' }, 401);
  const { data: editor, error: roleErr } = await asUser.rpc('is_editor');
  if (roleErr || !editor) return json({ error: 'Only editors can send notifications.' }, 403);

  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return json({ error: 'Email is not set up yet (RESEND_API_KEY and EMAIL_FROM). See README, step 5.' }, 500);

  let body: { submissionId?: string; noteOnly?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  if (!body.submissionId) return json({ error: 'submissionId is required.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: s, error } = await admin.from('submissions').select('id,user_id,kind,status,editor_note,article_id,payload').eq('id', body.submissionId).single();
  if (error || !s) return json({ error: 'Submission not found.' }, 404);
  const m = message(s as Sub, !!body.noteOnly);
  if (!m) return json({ ok: true, sent: false, reason: `No email for status "${s.status}".` });

  // Send to the address they signed in with; the contact field on the form is only a fallback.
  const { data: au } = await admin.auth.admin.getUserById(s.user_id);
  const contact = String(s.payload?.contact || '');
  const to = au?.user?.email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : '');
  if (!to) return json({ error: 'No email address for this contributor.' }, 422);
  const name = String(s.payload?.authorName || '').trim().split(/\s+/)[0] || 'contributor';
  const note = (s.editor_note || '').trim();

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject: m.subject, html: html(name, m, note), text: text(name, m, note),
      ...(Deno.env.get('EMAIL_REPLY_TO') ? { reply_to: Deno.env.get('EMAIL_REPLY_TO') } : {}),
    }),
  });
  if (!r.ok) return json({ error: `The email service refused the message (${r.status}): ${(await r.text()).slice(0, 200)}` }, 502);
  return json({ ok: true, sent: true });
});
