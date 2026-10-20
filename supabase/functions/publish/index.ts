// Edge function: rebuilds the public site. Called by the Publish button in /console.
// The Cloudflare deploy hook URL stays a server secret, so nobody can trigger builds from the page source.
//
// Deploy:  supabase functions deploy publish
// Secrets: supabase secrets set DEPLOY_HOOK_URL=https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...
//          supabase secrets set SITE_ORIGIN=https://digitalhealthdigest.africa,https://digitalhealthdigest.pages.dev
import { createClient } from 'npm:@supabase/supabase-js@2';

// SITE_ORIGIN may list several origins, comma-separated (e.g. the domain and the pages.dev address).
const allowed = (Deno.env.get('SITE_ORIGIN') || '').split(',').map((o) => o.trim()).filter(Boolean);
let cors: Record<string, string> = {};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
  // Act as the caller, so is_editor() sees their identity.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: user } = await asUser.auth.getUser();
  if (!user?.user) return json({ error: 'Sign in first.' }, 401);
  const { data: editor, error } = await asUser.rpc('is_editor');
  if (error || !editor) return json({ error: 'Only editors can publish.' }, 403);

  const hook = Deno.env.get('DEPLOY_HOOK_URL');
  if (!hook) return json({ error: 'DEPLOY_HOOK_URL is not set. See README, step 4.' }, 500);
  const r = await fetch(hook, { method: 'POST' });
  if (!r.ok) return json({ error: `The host refused the rebuild (${r.status}).` }, 502);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const when = new Date().toISOString();
  await admin.from('settings').update({ last_publish_at: when, last_publish_by: user.user.email ?? '' }).eq('id', 1);
  return json({ ok: true, at: when });
});
