-- Contributors change their own author photo. An editor links an author to a contributor by entering
-- the contributor's sign-in email (kept in author_logins, never public). That person may then update
-- their author's photo, and only the photo, and upload pictures named self-<their user id>-….

create table public.author_logins (
  author_id text primary key references public.authors (id) on delete cascade on update cascade,
  email text not null check (email = lower(email) and email like '%@%'),
  updated_at timestamptz not null default now()
);
create unique index author_logins_email on public.author_logins (email);
alter table public.author_logins enable row level security;
-- The signed-in user's email, from auth.users (security definer: callers cannot read that table).
create function public.my_email() returns text language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid()
$$;
create policy "editors manage author logins" on public.author_logins for all using (public.is_editor()) with check (public.is_editor());
create policy "contributors see their own link" on public.author_logins for select to authenticated using (email = public.my_email());

-- The linked contributor may update their author row...
create policy "authors update their own photo" on public.authors for update to authenticated
  using (exists (select 1 from public.author_logins l where l.author_id = authors.id and l.email = public.my_email()))
  with check (exists (select 1 from public.author_logins l where l.author_id = authors.id and l.email = public.my_email()));

-- ...but anyone other than an editor may change only photo_path.
create function public.guard_author_update() returns trigger language plpgsql as $$
begin
  if public.is_privileged() or public.is_editor() then return new; end if;
  if (to_jsonb(new) - 'photo_path' - 'updated_at') is distinct from (to_jsonb(old) - 'photo_path' - 'updated_at') then
    raise exception 'Contributors can change their photo only. Ask an editor for other changes.';
  end if;
  return new;
end $$;
create trigger guard_author_update before update on public.authors for each row execute function public.guard_author_update();

-- Uploads: a contributor's own files only, named self-<user id>-….
create policy "contributors upload own photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and name like ('self-' || auth.uid()::text || '-%'));
create policy "contributors replace own photo" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and name like ('self-' || auth.uid()::text || '-%'));
