-- Hand-picked related editions, and series (a name shared by every part, plus the part number).
alter table public.articles
  add column related text[] not null default '{}',
  add column series text not null default '',
  add column series_part integer check (series_part is null or series_part > 0);
