-- Revenue: sponsorships, featured opportunities, reader support and Google AdSense.
-- Everything stays hidden on the site until its settings are filled in from the console.

-- Sponsors: one for the whole site (scope 'site', shown on every edition) or one edition ('edition').
-- An edition's own sponsor takes the place of the site sponsor on that edition. Dates are inclusive.
create table public.sponsorships (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  url text not null default '',
  logo_path text not null default '',
  note text not null default '',                       -- one short line, e.g. what the sponsor does
  scope text not null default 'site' check (scope in ('site', 'edition')),
  article_id text references public.articles (id) on delete set null on update cascade,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'pending' check (status in ('pending', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope = 'site' or article_id is not null)
);
create trigger touch before update on public.sponsorships for each row execute function public.touch();
alter table public.sponsorships enable row level security;
create policy "read published sponsorships" on public.sponsorships for select using (status = 'published' or public.is_editor());
create policy "editors write sponsorships" on public.sponsorships for all using (public.is_editor()) with check (public.is_editor());

-- Featured (paid) opportunities: pinned to the top and labelled Featured until the date passes.
alter table public.opportunities
  add column featured_until date;

-- Settings for the money features.
alter table public.settings
  add column contact_email text not null default '',        -- shown on Partner with us
  add column support_url text not null default '',          -- e.g. the Substack paid tier, for "Support the Digest"
  add column featured_payment_url text not null default '', -- payment link for featured listings (Stripe, Paystack…)
  add column featured_price text not null default '',       -- e.g. "US$150 for 30 days"
  add column adsense_client text not null default '' check (adsense_client = '' or adsense_client ~ '^ca-pub-[0-9]{10,20}$'),
  add column adsense_slot_article text not null default '' check (adsense_slot_article ~ '^[0-9]*$'),
  add column adsense_slot_list text not null default '' check (adsense_slot_list ~ '^[0-9]*$');

-- Changes rebuild the site, like other public content.
create or replace function public.request_rebuild() returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_public boolean := false;
  is_public boolean := false;
begin
  if TG_TABLE_NAME in ('articles', 'resources', 'opportunities', 'partners', 'sponsorships') then
    if TG_OP <> 'INSERT' then was_public := old.status = 'published'; end if;
    if TG_OP <> 'DELETE' then is_public := new.status = 'published'; end if;
    if not (was_public or is_public) then return null; end if;
  elsif TG_TABLE_NAME = 'article_authors' then
    if not exists (select 1 from public.articles a
                   where a.status = 'published'
                     and a.id = (case when TG_OP = 'DELETE' then old.article_id else new.article_id end)) then
      return null;
    end if;
  elsif TG_TABLE_NAME = 'settings' then
    if TG_OP = 'UPDATE' and (to_jsonb(new) - 'last_publish_at' - 'last_publish_by' - 'updated_at')
                          = (to_jsonb(old) - 'last_publish_at' - 'last_publish_by' - 'updated_at') then
      return null;
    end if;
  end if;
  update public.site_build set requested_at = now() where id = 1;
  return null;
end $$;
create trigger rebuild_on_change after insert or update or delete on public.sponsorships for each row execute function public.request_rebuild();

-- Once a day (00:05 UTC) ask for a rebuild, so anything date-based (closed calls, ended sponsorships,
-- expired featured listings) leaves the site on its own. The minute job then fires it.
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dhd-daily-refresh', '5 0 * * *', $cmd$ update public.site_build set requested_at = now() - interval '2 minutes' where id = 1 $cmd$);
  end if;
end
$outer$;
