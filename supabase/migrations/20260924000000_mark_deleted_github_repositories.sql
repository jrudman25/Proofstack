alter table public.projects
  add column if not exists github_deleted_at timestamp with time zone;
