-- Several to-do lists per member, each shared with whoever its owner picks.
create table public.task_lists (
  id text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  -- Members the owner has let see this list.
  shared_with uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index task_lists_member on public.task_lists (member_id, position);

-- A member's own categories for tagging tasks.
create table public.task_categories (
  id text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  name text not null,
  color text not null,
  position integer not null default 0
);
create index task_categories_member on public.task_categories (member_id, position);

-- Every task now sits in a list and may carry a category. Tasks from before go into a first list.
alter table public.tasks add column list_id text references public.task_lists (id) on delete cascade;
alter table public.tasks add column category text not null default '';
insert into public.task_lists (id, member_id, name) select 'first-' || member_id, member_id, 'My tasks' from public.tasks group by member_id;
update public.tasks set list_id = 'first-' || member_id;
alter table public.tasks alter column list_id set not null;

-- A session belongs to the list it closed, and its titles are for the people that list was shared with.
alter table public.task_sessions add column list_name text not null default '';
alter table public.task_sessions add column shared_with uuid[] not null default '{}';
alter table public.task_sessions drop column shared;
alter table public.members drop column tasks_shared;

alter table public.task_lists enable row level security;
alter table public.task_categories enable row level security;
revoke all on public.task_lists, public.task_categories from anon, authenticated;
grant all on public.task_lists, public.task_categories to service_role;
