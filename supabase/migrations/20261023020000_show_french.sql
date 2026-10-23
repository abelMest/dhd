-- The French "En bref" lines stay in the database but are hidden on the site until this is switched on
-- (Console, Settings). A reader-facing language button can later replace this switch.
alter table public.settings add column show_french boolean not null default false;
