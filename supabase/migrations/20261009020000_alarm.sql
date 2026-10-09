-- A member's own alarm: the moment it should ring, and an optional word about what it is for.
alter table public.members add column alarm_at timestamptz;
alter table public.members add column alarm_label text not null default '';
