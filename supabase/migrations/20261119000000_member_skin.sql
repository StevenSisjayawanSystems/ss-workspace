-- The skin tone a member picked for their character. Rows saved before this keep the wizard's own.
alter table public.members add column skin text not null default '#f0c6b3';
