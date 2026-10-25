-- A third kind of logo: 'reader', organisations where readers of the Digest work ("Read by people at").
-- They show on the home and Partner pages only, never as partners.
alter table public.partners drop constraint if exists partners_kind_check;
alter table public.partners add constraint partners_kind_check check (kind in ('partner', 'past', 'reader'));
