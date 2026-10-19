// Browser-side Supabase client for /contribute and /console. Uses only the public anon key:
// what each person can read or change is decided by the row-level security rules in supabase/migrations.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;
  return client;
}

export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that. Try signing in again.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.';
  if (/fetch|network/i.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  return msg;
}
