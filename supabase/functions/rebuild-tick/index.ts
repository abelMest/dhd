// Edge function: called once a minute by pg_cron (see migrations/20261022000000_live_site.sql)
// when public content has changed. Rebuilds the site once the changes have been quiet for 90 seconds.
//
// Deploy:  supabase functions deploy rebuild-tick --no-verify-jwt
// It needs no caller identity: it only ever rebuilds when the database says something changed,
// so calling it at other times does nothing. Uses the DEPLOY_HOOK_URL secret, like `publish`.
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const quiet = new Date(Date.now() - 90_000).toISOString();
  const now = new Date().toISOString();

  // Claim the pending request in one statement, so two ticks can never both fire a build.
  const { data: state, error: readErr } = await admin.from('site_build').select('requested_at,built_at').eq('id', 1).single();
  if (readErr) return json({ error: readErr.message }, 500);
  if (!state.requested_at || state.requested_at <= state.built_at || state.requested_at >= quiet) return json({ skipped: 'nothing due' });
  const { data: claimed, error } = await admin.from('site_build').update({ built_at: now })
    .eq('id', 1).eq('built_at', state.built_at).select('id');
  if (error) return json({ error: error.message }, 500);
  if (!claimed?.length) return json({ skipped: 'already claimed' });

  const hook = Deno.env.get('DEPLOY_HOOK_URL');
  if (!hook) return json({ error: 'DEPLOY_HOOK_URL is not set.' }, 500);
  const r = await fetch(hook, { method: 'POST' });
  if (!r.ok) {
    await admin.from('site_build').update({ built_at: state.built_at }).eq('id', 1);   // try again next minute
    return json({ error: `The host refused the rebuild (${r.status}).` }, 502);
  }
  await admin.from('settings').update({ last_publish_at: now, last_publish_by: 'automatic (content changed)' }).eq('id', 1);
  return json({ ok: true, at: now });
});
