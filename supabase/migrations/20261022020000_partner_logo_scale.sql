-- Logos differ in visual weight (a bold wordmark looks bigger than a logo with a tagline at the same height).
-- logo_scale lets the editor even them out: a percentage of the standard logo height.
alter table public.partners
  add column logo_scale integer not null default 100 check (logo_scale between 40 and 160);
