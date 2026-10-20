-- Optional overrides for what search engines show. Empty means: build them from the title, standfirst and opening.
alter table public.articles
  add column seo_title text not null default '',
  add column seo_description text not null default '';
