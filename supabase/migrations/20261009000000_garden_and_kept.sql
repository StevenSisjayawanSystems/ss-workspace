-- Focus Garden: each member's total time in shared focus sessions, which is what grows their plants.
-- It lives on the member so a bed can never be lost to a redeploy or a change of name.
alter table public.members add column focus_seconds bigint not null default 0;

-- Small pieces of shared state the server keeps whole, by name: desk claims and room bookings.
create table public.kept (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.kept enable row level security;
revoke all on public.kept from anon, authenticated;
grant all on public.kept to service_role;
