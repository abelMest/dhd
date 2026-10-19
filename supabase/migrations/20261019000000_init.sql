-- Digital Health Digest: schema and access rules.
-- Mirrors the v6 data model (HANDOVER section 5) and its claude.ai access rules:
--   everyone reads published public content; only editors write it;
--   signed-in people manage only their own submissions; editors read and review all submissions.


-- ---------- People ----------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'contributor' check (role in ('contributor', 'editor')),
  created_at timestamptz not null default now()
);

-- Every new sign-in gets a contributor profile. Editors are promoted by hand (see README).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'editor');
$$;

-- True for editors, and for trusted server-side work with no signed-in user: the SQL editor, migrations
-- and the service-role import script. Anonymous visitors also have no user, but RLS policies keep them out
-- before any trigger that uses this can run.
create function public.is_privileged() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is null or public.is_editor();
$$;

-- ---------- Public content ----------

create table public.authors (
  id text primary key,
  name text not null,
  role text not null default '',
  org text not null default '',
  country text not null default '',
  bio text not null default '',
  linkedin_url text not null default '',
  substack_url text not null default '',
  photo_path text not null default '',
  is_editor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.articles (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  dek text not null default '',
  fr text not null default '',
  topic text not null,
  published_at date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  substack_url text not null default '',
  linkedin_url text not null default '',
  featured boolean not null default false,
  pinned boolean not null default false,
  start_for text[] not null default '{}',
  read_mins integer,
  body_md text not null default '',
  source text not null default 'editor' check (source in ('editor', 'substack', 'submission', 'v6')),
  submission_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_published on public.articles (status, published_at desc);

create table public.article_authors (
  article_id text not null references public.articles (id) on delete cascade on update cascade,
  author_id text not null references public.authors (id) on delete restrict on update cascade,
  position integer not null default 0,
  primary key (article_id, author_id)
);

create table public.resources (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  url text not null,
  summary text not null default '',
  publisher text not null default '',
  year text not null default '',
  topic text not null default '',
  type text not null default '',
  countries text[] not null default '{}',
  audience text[] not null default '{}',
  status text not null default 'published' check (status in ('pending', 'published')),
  added_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  org text not null default '',
  kind text not null default '',
  url text not null,
  deadline date,
  eligibility text not null default '',
  countries text[] not null default '{}',
  verified_at date,
  status text not null default 'pending' check (status in ('pending', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Editor-only notes live in their own table, so no reader can ever select them.
create table public.opportunity_notes (
  opportunity_id text primary key references public.opportunities (id) on delete cascade on update cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.settings (
  id integer primary key default 1 check (id = 1),
  subscribers integer not null default 0,
  subscribers_label text not null default '',
  editions_total integer not null default 0,
  substack_url text not null default 'https://dhdigest.substack.com/',
  linkedin_url text not null default '',
  last_publish_at timestamptz,               -- set by the publish function when an editor rebuilds the site
  last_publish_by text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.site_copy (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- Submissions ----------
-- One row per pitch, resource suggestion or opportunity tip. "kind" is the submission type and is never
-- overwritten by the payload (fixes the v6 bug where an opportunity tip's own kind replaced it).

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pitch', 'resource', 'opportunity')),
  payload jsonb not null default '{}',
  draft_url text not null default '',
  draft_text text not null default '',
  draft_at timestamptz,
  status text not null default 'new'
    check (status in ('new', 'accepted', 'draft', 'in_review', 'changes', 'approved', 'published', 'declined', 'added')),
  editor_note text not null default '',
  reviewed_at timestamptz,
  article_id text references public.articles (id) on delete set null on update cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index submissions_user on public.submissions (user_id, created_at desc);
alter table public.articles add constraint articles_submission_fk
  foreign key (submission_id) references public.submissions (id) on delete set null;

-- Contributors may only add a draft, and only once a pitch is accepted or has changes requested.
-- Moving the status to 'draft' is how the editor's queue learns a draft arrived.
create function public.guard_submission_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_privileged() then
    new.updated_at := now();
    return new;
  end if;
  if old.kind <> 'pitch' or old.status not in ('accepted', 'changes') then
    raise exception 'You can add a draft only after the editor accepts your pitch or asks for changes.';
  end if;
  if new.kind is distinct from old.kind or new.payload is distinct from old.payload
     or new.user_id is distinct from old.user_id or new.editor_note is distinct from old.editor_note
     or new.article_id is distinct from old.article_id or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Contributors can only add a draft link or draft text.';
  end if;
  new.status := 'draft';
  new.draft_at := now();
  new.updated_at := now();
  return new;
end $$;
create trigger submissions_guard before update on public.submissions
  for each row execute function public.guard_submission_update();

-- New submissions always start as 'new' with no editor fields, whoever sends them.
create function public.guard_submission_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_privileged() then
    new.user_id := auth.uid();
    new.status := 'new';
    new.editor_note := '';
    new.reviewed_at := null;
    new.article_id := null;
  end if;
  return new;
end $$;
create trigger submissions_guard_insert before insert on public.submissions
  for each row execute function public.guard_submission_insert();

-- ---------- updated_at ----------

create function public.touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger touch before update on public.authors for each row execute function public.touch();
create trigger touch before update on public.articles for each row execute function public.touch();
create trigger touch before update on public.resources for each row execute function public.touch();
create trigger touch before update on public.opportunities for each row execute function public.touch();
create trigger touch before update on public.settings for each row execute function public.touch();
create trigger touch before update on public.site_copy for each row execute function public.touch();
create trigger touch before update on public.opportunity_notes for each row execute function public.touch();

-- ---------- Row-level security ----------

alter table public.profiles enable row level security;
alter table public.authors enable row level security;
alter table public.articles enable row level security;
alter table public.article_authors enable row level security;
alter table public.resources enable row level security;
alter table public.opportunities enable row level security;
alter table public.settings enable row level security;
alter table public.site_copy enable row level security;
alter table public.submissions enable row level security;

-- Profiles: you see your own; editors see all (to name contributors). Only editors change roles.
create policy "own profile" on public.profiles for select using (user_id = auth.uid() or public.is_editor());
create policy "update own or editors" on public.profiles for update using (user_id = auth.uid() or public.is_editor());

-- Only editors change roles (a policy cannot compare old and new values, so a trigger does it).
create function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and not public.is_privileged() then
    raise exception 'Only editors can change roles.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot change.';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_role();

-- Public content: anyone reads what is published; editors read and write everything.
create policy "read authors" on public.authors for select using (true);
create policy "read published articles" on public.articles for select using (status = 'published' or public.is_editor());
create policy "read bylines" on public.article_authors for select using (
  public.is_editor() or exists (select 1 from public.articles a where a.id = article_id and a.status = 'published'));
create policy "read published resources" on public.resources for select using (status = 'published' or public.is_editor());
create policy "read published opportunities" on public.opportunities for select using (status = 'published' or public.is_editor());
create policy "read settings" on public.settings for select using (true);
create policy "read copy" on public.site_copy for select using (true);

create policy "editors write authors" on public.authors for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write articles" on public.articles for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write bylines" on public.article_authors for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write resources" on public.resources for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write opportunities" on public.opportunities for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write settings" on public.settings for update using (public.is_editor()) with check (public.is_editor());
create policy "editors write copy" on public.site_copy for all using (public.is_editor()) with check (public.is_editor());

alter table public.opportunity_notes enable row level security;
create policy "editors only notes" on public.opportunity_notes for all using (public.is_editor()) with check (public.is_editor());

-- Submissions: your own, plus everything for editors. Contributors never delete; editors may.
create policy "read own submissions" on public.submissions for select using (user_id = auth.uid() or public.is_editor());
create policy "send submissions" on public.submissions for insert to authenticated with check (user_id = auth.uid() or public.is_editor());
create policy "update own or review" on public.submissions for update using (user_id = auth.uid() or public.is_editor());
create policy "editors delete submissions" on public.submissions for delete using (public.is_editor());

-- ---------- Storage: author and About photos ----------

insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do nothing;
create policy "editors upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_editor());
create policy "editors replace photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_editor());
create policy "editors delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_editor());
