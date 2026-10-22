-- Partner logos, managed in the console. kind: 'partner' (works with the Digest now) or 'past'
-- (organisations the team has worked with). Show only organisations that agreed to logo use.
create table public.partners (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  url text not null default '',
  logo_path text not null default '',
  kind text not null default 'partner' check (kind in ('partner', 'past')),
  position integer not null default 0,
  status text not null default 'published' check (status in ('pending', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger touch before update on public.partners for each row execute function public.touch();
alter table public.partners enable row level security;
create policy "read published partners" on public.partners for select using (status = 'published' or public.is_editor());
create policy "editors write partners" on public.partners for all using (public.is_editor()) with check (public.is_editor());

-- Partners are public content: a change rebuilds the site like any other (see 20261022000000_live_site.sql).
create or replace function public.request_rebuild() returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_public boolean := false;
  is_public boolean := false;
begin
  if TG_TABLE_NAME in ('articles', 'resources', 'opportunities', 'partners') then
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
create trigger rebuild_on_change after insert or update or delete on public.partners for each row execute function public.request_rebuild();
