-- A member's own to-do list, in the order they keep it.
create table public.tasks (
  id text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  -- Whether finishing it has already helped their plant along, so a task cannot be cashed in twice.
  rewarded boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index tasks_member on public.tasks (member_id, position);

-- One row each time a member says they are done with a set of tasks: when, and what they got done.
create table public.task_sessions (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  done integer not null,
  total integer not null,
  titles text[] not null default '{}',
  -- Whether their list was shared at the time; if not, other people see the counts but not the titles.
  shared boolean not null default false
);
create index task_sessions_member on public.task_sessions (member_id, ended_at desc);

-- Whether a member lets others see their list, and how many tasks have helped their plant today.
alter table public.members add column tasks_shared boolean not null default false;
alter table public.members add column task_bonus_day text not null default '';
alter table public.members add column task_bonus_count integer not null default 0;

alter table public.tasks enable row level security;
alter table public.task_sessions enable row level security;
revoke all on public.tasks, public.task_sessions from anon, authenticated;
grant all on public.tasks, public.task_sessions to service_role;
grant usage, select on sequence public.task_sessions_id_seq to service_role;
