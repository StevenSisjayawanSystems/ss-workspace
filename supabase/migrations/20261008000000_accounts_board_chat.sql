-- Everything here is read and written by the game server, which uses the secret key and so bypasses
-- row level security. Browsers only ever sign in and read their own member row.

-- One row per person: who they are, how they look, and the counters their level is derived from.
create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  robe text not null default '#4a6fa5',
  trim text not null default '#e0b04a',
  hair text not null default '#7a4a2a',
  hat boolean not null default true,
  seconds bigint not null default 0,
  call_seconds bigint not null default 0,
  metres bigint not null default 0,
  messages integer not null default 0,
  songs integer not null default 0,
  pomodoros integer not null default 0,
  days integer not null default 0,
  streak integer not null default 0,
  -- Local calendar day of the last visit, as YYYY-MM-DD; empty before the first.
  last_day text not null default '',
  -- When they were last in the guildhouse, so mentions and direct messages since then show as unread.
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Sticky notes on the bulletin board. `board` is 'features' or 'fun'; x and y place the note as a
-- fraction of the board, and on the feature board the lane is read off x.
create table public.notes (
  id text primary key,
  board text not null default 'fun' check (board in ('features', 'fun')),
  body text not null,
  color text not null,
  x real not null default 0.5,
  y real not null default 0.5,
  z integer not null default 0,
  author_id uuid references public.members (id) on delete set null,
  author_name text not null default '',
  votes uuid[] not null default '{}',
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Chat. A null recipient is the room everyone shares; otherwise it is a direct message.
create table public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.members (id) on delete cascade,
  recipient_id uuid references public.members (id) on delete cascade,
  sender_name text not null default '',
  body text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index messages_room on public.messages (created_at desc) where recipient_id is null;
create index messages_sent on public.messages (sender_id, created_at desc) where recipient_id is not null;
create index messages_received on public.messages (recipient_id, created_at desc) where recipient_id is not null;

alter table public.members enable row level security;
alter table public.notes enable row level security;
alter table public.messages enable row level security;

revoke all on public.members, public.notes, public.messages from anon, authenticated;
grant all on public.members, public.notes, public.messages to service_role;
grant usage, select on sequence public.messages_id_seq to service_role;

-- The title screen reads your own row to bring your name and look to a new device.
grant select on public.members to authenticated;
create policy "Members read their own row" on public.members for select to authenticated using ((select auth.uid()) = id);
