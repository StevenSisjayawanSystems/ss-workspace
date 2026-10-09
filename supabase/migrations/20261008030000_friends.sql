-- Friendship sits on the bond between two members: one asks, and it holds once the other accepts.
alter table public.bonds add column friends boolean not null default false;
alter table public.bonds add column asked_by uuid references public.members (id) on delete set null;
