-- Anonymous counts for the home page's hero cards: one 'home-view' per visit and one row per card click.
-- No cookies, no IP address, no user id: only what was clicked and when. Anyone may add a row; only
-- editors can read them (console Overview).
create table public.clicks (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  target text not null check (target ~ '^[a-z0-9-]{1,40}$'),
  ref text not null default '' check (length(ref) <= 120)
);
create index clicks_at on public.clicks (at desc);
alter table public.clicks enable row level security;
create policy "anyone records a click" on public.clicks for insert to anon, authenticated with check (true);
create policy "editors read clicks" on public.clicks for select using (public.is_editor());
-- Clicks never trigger a site rebuild (no trigger on this table).
