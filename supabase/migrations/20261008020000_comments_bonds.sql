-- Comments under a sticky note.
create table public.note_comments (
  id text primary key,
  note_id text not null references public.notes (id) on delete cascade,
  author_id uuid references public.members (id) on delete set null,
  author_name text not null default '',
  body text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index note_comments_note on public.note_comments (note_id, created_at);

-- What two members have done together: one row per pair, with the smaller id first.
create table public.bonds (
  a uuid not null references public.members (id) on delete cascade,
  b uuid not null references public.members (id) on delete cascade,
  call_seconds bigint not null default 0,
  focus_seconds bigint not null default 0,
  messages integer not null default 0,
  primary key (a, b),
  check (a < b)
);

alter table public.note_comments enable row level security;
alter table public.bonds enable row level security;
revoke all on public.note_comments, public.bonds from anon, authenticated;
grant all on public.note_comments, public.bonds to service_role;
