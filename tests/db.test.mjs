// Runs the real migration in PGlite (Postgres in WebAssembly) and checks the access rules.
// No Docker or Supabase project needed:  node --test tests/
// Supabase's own auth and storage schemas are stubbed with just what the migration touches.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { transform } from '../scripts/import-v6.mjs';

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

const EDITOR = '00000000-0000-0000-0000-00000000000e';
const ALICE = '00000000-0000-0000-0000-0000000000a1';
const BOB = '00000000-0000-0000-0000-0000000000b2';
let db;

async function as(who, sql, params) {
  await db.exec('reset role');
  if (who === 'admin') return db.query(sql, params);
  const role = who === 'anon' ? 'anon' : 'authenticated';
  const sub = { editor: EDITOR, alice: ALICE, bob: BOB }[who] || '';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const rows = async (who, sql, params) => (await as(who, sql, params)).rows;
const fails = async (who, sql, params, re) => assert.rejects(() => as(who, sql, params), re);

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(new URL('../supabase/migrations/', import.meta.url)).sort()) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
  }
  // Users: the trigger creates their profiles. Promote one to editor, as the README describes.
  for (const [id, email] of [[EDITOR, 'editor@example.org'], [ALICE, 'alice@example.org'], [BOB, 'bob@example.org']]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  }
  await db.query(`update public.profiles set role = 'editor' where user_id = $1`, [EDITOR]);

  // Load the v6 seed exactly as the import script would.
  const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));
  const d = transform(seed, '2026-10-19');
  const ins = async (table, list) => {
    for (const r of list) {
      const cols = Object.keys(r);
      await db.query(`insert into public.${table} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map((c) => r[c]));
    }
  };
  await ins('authors', d.authors);
  await ins('articles', d.articles);
  await ins('article_authors', d.bylines);
  await ins('opportunities', d.opportunities);
  await db.query(`insert into public.opportunity_notes (opportunity_id, notes) values ('cphia-2026', 'Ask about press passes')`);
  await db.query(`insert into public.articles (id, title, topic, published_at, status) values ('secret-draft', 'Draft', 'AI & data', '2026-10-19', 'draft')`);
  await db.query(`insert into public.opportunities (id, title, url, status) values ('pending-tip', 'Unverified', 'https://example.org', 'pending')`);
});

test('the v6 seed loads completely', async () => {
  assert.equal((await rows('admin', 'select count(*)::int n from public.articles where status = $1', ['published']))[0].n, 20);
  assert.equal((await rows('admin', 'select count(*)::int n from public.article_authors'))[0].n, 20);
  const abel = (await rows('admin', `select linkedin_url, substack_url from public.authors where id = 'abel'`))[0];
  assert.equal(abel.linkedin_url, '');
  assert.match(abel.substack_url, /substack\.com/);
});

test('anyone reads published content, and only published content', async () => {
  const ids = (await rows('anon', 'select id from public.articles')).map((r) => r.id);
  assert.equal(ids.length, 20);
  assert.ok(!ids.includes('secret-draft'));
  assert.ok(!(await rows('anon', 'select id from public.opportunities')).some((r) => r.id === 'pending-tip'));
  assert.equal((await rows('anon', 'select * from public.settings')).length, 1);
  assert.ok(!(await rows('alice', 'select id from public.articles')).some((r) => r.id === 'secret-draft'));
});

test('editor notes on opportunities are hidden from everyone but editors', async () => {
  assert.equal((await rows('anon', 'select * from public.opportunity_notes')).length, 0);
  assert.equal((await rows('alice', 'select * from public.opportunity_notes')).length, 0);
  assert.equal((await rows('editor', 'select * from public.opportunity_notes')).length, 1);
});

test('only editors write public content', async () => {
  for (const who of ['anon', 'alice']) {
    const r = await as(who, `update public.articles set title = 'x' where id = 'why-pilots-fail'`);
    assert.equal(r.affectedRows, 0, `${who} must not update articles`);
    await fails(who, `insert into public.articles (id, title, topic, published_at) values ('x', 'x', 'AI & data', '2026-01-01')`, [], /row-level security/);
    await fails(who, `insert into public.site_copy (key, value) values ('lede', 'hacked')`, [], /row-level security/);
  }
  const r = await as('editor', `update public.articles set pinned = true where id = 'secret-draft'`);
  assert.equal(r.affectedRows, 1);
  assert.equal((await rows('editor', `select id from public.articles where id = 'secret-draft'`)).length, 1);
});

test('contributors see only their own submissions; editors see all', async () => {
  await as('alice', `insert into public.submissions (kind, payload) values ('pitch', '{"title":"Alice pitch"}')`);
  await as('bob', `insert into public.submissions (kind, payload) values ('opportunity', '{"title":"Bob tip","kind":"Fellowship"}')`);
  const mine = await rows('alice', 'select kind, payload, user_id from public.submissions');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].user_id, ALICE);
  assert.equal((await rows('editor', 'select * from public.submissions')).length, 2);
  // v6 bug: the tip's own "kind" overwrote the submission kind. Here they are separate.
  const tip = (await rows('editor', `select kind, payload->>'kind' as opp_kind from public.submissions where payload->>'title' = 'Bob tip'`))[0];
  assert.deepEqual(tip, { kind: 'opportunity', opp_kind: 'Fellowship' });
  await fails('anon', `insert into public.submissions (kind) values ('pitch')`, [], /permission denied|row-level security/);
});

test('contributors cannot review themselves, and add drafts only when invited', async () => {
  // Trying to self-approve on insert is silently reset to "new".
  await as('alice', `insert into public.submissions (kind, payload, status, editor_note) values ('pitch', '{"title":"Sneaky"}', 'approved', 'great')`);
  const sneaky = (await rows('alice', `select status, editor_note from public.submissions where payload->>'title' = 'Sneaky'`))[0];
  assert.deepEqual(sneaky, { status: 'new', editor_note: '' });

  await fails('alice', `update public.submissions set draft_url = 'https://docs' where payload->>'title' = 'Alice pitch'`, [], /only after the editor accepts/);
  await as('editor', `update public.submissions set status = 'accepted', editor_note = 'Yes please' where payload->>'title' = 'Alice pitch'`);
  await fails('alice', `update public.submissions set editor_note = 'mine now' where payload->>'title' = 'Alice pitch'`, [], /only add a draft/);
  await as('alice', `update public.submissions set draft_url = 'https://docs.example/draft' where payload->>'title' = 'Alice pitch'`);
  const s = (await rows('alice', `select status, draft_url, draft_at is not null as stamped from public.submissions where payload->>'title' = 'Alice pitch'`))[0];
  assert.deepEqual(s, { status: 'draft', draft_url: 'https://docs.example/draft', stamped: true });
  // Bob cannot touch Alice's submission at all.
  const r = await as('bob', `update public.submissions set draft_text = 'x' where payload->>'title' = 'Alice pitch'`);
  assert.equal(r.affectedRows, 0);
  // No delete policy for contributors, so RLS filters every row out.
  assert.equal((await as('alice', 'delete from public.submissions')).affectedRows, 0);
});

test('only editors change roles', async () => {
  await fails('alice', `update public.profiles set role = 'editor' where user_id = $1`, [ALICE], /Only editors/);
  const r = await as('alice', `update public.profiles set display_name = 'Alice A.' where user_id = $1`, [ALICE]);
  assert.equal(r.affectedRows, 1);
  assert.equal((await as('alice', `update public.profiles set display_name = 'x' where user_id = $1`, [BOB])).affectedRows, 0);
  assert.equal((await rows('alice', 'select * from public.profiles')).length, 1);
});

test('public changes ask for a rebuild; drafts and rebuild bookkeeping do not', async () => {
  const requested = async () => (await rows('admin', 'select requested_at from public.site_build where id = 1'))[0].requested_at;
  const clear = () => db.query('update public.site_build set requested_at = null where id = 1');

  await clear();
  await db.query(`update public.articles set title = 'Draft, renamed' where id = 'secret-draft'`);
  await db.query(`insert into public.article_authors (article_id, author_id) values ('secret-draft', 'abel')`);
  assert.equal(await requested(), null, 'editing a draft must not rebuild the site');

  await db.query(`update public.settings set last_publish_at = now(), last_publish_by = 'x' where id = 1`);
  assert.equal(await requested(), null, 'recording a rebuild must not ask for another');

  await db.query(`update public.articles set status = 'published' where id = 'secret-draft'`);
  assert.ok(await requested(), 'publishing an edition asks for a rebuild');

  await clear();
  await db.query(`update public.articles set status = 'draft' where id = 'secret-draft'`);
  assert.ok(await requested(), 'unpublishing an edition asks for a rebuild too');

  await clear();
  await db.query(`insert into public.site_copy (key, value) values ('announce', 'Hello') on conflict (key) do update set value = excluded.value`);
  assert.ok(await requested(), 'site text changes ask for a rebuild');
});

test('subscriber numbers carry their own date', async () => {
  await db.query(`update public.settings set subscribers_updated_at = null where id = 1`);
  const s0 = (await rows('admin', 'select subscribers_updated_at d, linkedin_only_editions l from public.settings where id = 1'))[0];
  assert.equal(s0.d, null, 'the date cannot be set by hand');
  assert.equal(s0.l, 42);
  await db.query(`update public.settings set subscribers_linkedin = 7000, subscribers_substack = 500 where id = 1`);
  const s1 = (await rows('admin', 'select subscribers_updated_at d from public.settings where id = 1'))[0];
  assert.ok(s1.d, 'changing a count stamps today');
});

test('a linked contributor changes their own author photo, and nothing else', async () => {
  await db.query(`insert into public.author_logins (author_id, email) values ('albert-attom', 'alice@example.org') on conflict (author_id) do update set email = excluded.email`);
  const r = await rows('alice', `update public.authors set photo_path = 'photos/self-${ALICE}-1.jpg' where id = 'albert-attom' returning photo_path`);
  assert.equal(r.length, 1, 'Alice can set her own photo');
  await fails('alice', `update public.authors set bio = 'changed' where id = 'albert-attom'`, /photo only/);
  const other = await rows('alice', `update public.authors set photo_path = 'x' where id = 'abel' returning id`);
  assert.equal(other.length, 0, 'but not anyone else’s');
  const bob = await rows('bob', `update public.authors set photo_path = 'x' where id = 'albert-attom' returning id`);
  assert.equal(bob.length, 0, 'an unlinked contributor cannot change it');
  assert.equal((await rows('bob', 'select * from public.author_logins')).length, 0, 'sign-in emails are private');
  assert.equal((await rows('alice', 'select * from public.author_logins')).length, 1, 'Alice sees only her own link');
  await fails('anon', 'select * from public.author_logins', /permission|denied/i).catch(async () => {
    assert.equal((await rows('anon', 'select * from public.author_logins')).length, 0);
  });
});
