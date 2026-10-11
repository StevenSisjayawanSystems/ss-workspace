-- How pressing a task is: an optional priority (1 high, 2 medium, 3 low, 0 unset), the day it is
-- due, and a star for the ones that must be done today.
alter table public.tasks add column priority smallint not null default 0;
alter table public.tasks add column due date;
alter table public.tasks add column starred boolean not null default false;
