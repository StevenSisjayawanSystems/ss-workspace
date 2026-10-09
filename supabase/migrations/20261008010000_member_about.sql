-- A few words a member writes about themselves, shown on their profile.
alter table public.members add column about text not null default '';
