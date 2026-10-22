-- Keeps the public site in step with the database without anyone pressing Publish site.
--   1. settings: per-platform subscriber counts (dated automatically) and LinkedIn-only editions.
--   2. site_build: one row recording when a rebuild was asked for and when the last one started.
--   3. Triggers on public content ask for a rebuild (draft edits do not).
--   4. Once a minute, pg_cron calls the rebuild-tick function, but only when a request has been
--      quiet for 90 seconds, so a burst of edits becomes one rebuild.

-- 1. Figures -------------------------------------------------------------------------------
alter table public.settings
  add column linkedin_only_editions integer not null default 0 check (linkedin_only_editions >= 0),
  add column subscribers_linkedin integer check (subscribers_linkedin is null or subscribers_linkedin >= 0),
  add column subscribers_substack integer check (subscribers_substack is null or subscribers_substack >= 0),
  add column subscribers_updated_at date;

-- 63 editions in total on 20 October 2026: 20 on this site, 1 only on Substack, so 42 only on LinkedIn.
update public.settings set linkedin_only_editions = 42 where id = 1;

-- The "as of" date follows the numbers, so the label on the site can never claim a newer date than the data.
create function public.stamp_subscribers() returns trigger language plpgsql as $$
begin
  if new.subscribers_linkedin is distinct from old.subscribers_linkedin
     or new.subscribers_substack is distinct from old.subscribers_substack then
    new.subscribers_updated_at := current_date;
  else
    new.subscribers_updated_at := old.subscribers_updated_at;
  end if;
  return new;
end $$;
create trigger stamp_subscribers before update on public.settings for each row execute function public.stamp_subscribers();

-- 2. Build queue ---------------------------------------------------------------------------
create table public.site_build (
  id integer primary key default 1 check (id = 1),
  requested_at timestamptz,
  built_at timestamptz not null default now()
);
insert into public.site_build (id) values (1);
alter table public.site_build enable row level security;
create policy "editors read build state" on public.site_build for select using (public.is_editor());

-- 3. What counts as a public change ---------------------------------------------------------
create function public.request_rebuild() returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_public boolean := false;
  is_public boolean := false;
begin
  if TG_TABLE_NAME in ('articles', 'resources', 'opportunities') then
    if TG_OP <> 'INSERT' then was_public := old.status = 'published'; end if;
    if TG_OP <> 'DELETE' then is_public := new.status = 'published'; end if;
    if not (was_public or is_public) then return null; end if;          -- draft or pending: nothing visible changed
  elsif TG_TABLE_NAME = 'article_authors' then
    if not exists (select 1 from public.articles a
                   where a.status = 'published'
                     and a.id = (case when TG_OP = 'DELETE' then old.article_id else new.article_id end)) then
      return null;
    end if;
  elsif TG_TABLE_NAME = 'settings' then
    -- The publish bookkeeping columns change on every rebuild; ignore them or each build would ask for another.
    if TG_OP = 'UPDATE' and (to_jsonb(new) - 'last_publish_at' - 'last_publish_by' - 'updated_at')
                          = (to_jsonb(old) - 'last_publish_at' - 'last_publish_by' - 'updated_at') then
      return null;
    end if;
  end if;
  update public.site_build set requested_at = now() where id = 1;
  return null;
end $$;

create trigger rebuild_on_change after insert or update or delete on public.articles for each row execute function public.request_rebuild();
create trigger rebuild_on_change after insert or update or delete on public.article_authors for each row execute function public.request_rebuild();
create trigger rebuild_on_change after insert or update or delete on public.authors for each row execute function public.request_rebuild();
create trigger rebuild_on_change after insert or update or delete on public.resources for each row execute function public.request_rebuild();
create trigger rebuild_on_change after insert or update or delete on public.opportunities for each row execute function public.request_rebuild();
create trigger rebuild_on_change after insert or update or delete on public.site_copy for each row execute function public.request_rebuild();
create trigger rebuild_on_change after update on public.settings for each row execute function public.request_rebuild();

-- 4. Once a minute: fire the rebuild when a request has been quiet for 90 seconds.
-- Only where pg_cron and pg_net exist (Supabase); local test databases skip this.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('dhd-rebuild-tick', '* * * * *', $cmd$
      select net.http_post(
        url := 'https://divchzdusulnetgulnwk.supabase.co/functions/v1/rebuild-tick',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb)
      where exists (
        select 1 from public.site_build
        where requested_at > built_at and requested_at < now() - interval '90 seconds')
    $cmd$);
  end if;
end
$outer$;
