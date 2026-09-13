begin;

set local search_path = public, pg_temp;

create table if not exists public.project_briefs (
  project_id uuid references public.projects(id) on delete cascade primary key,
  visibility text check (visibility in ('private', 'public')) default 'private' not null,
  lifecycle_status text check (lifecycle_status in ('prototype', 'active', 'maintained', 'completed', 'archived')),
  purpose text,
  inspiration text,
  role_and_contributions text,
  architecture_and_decisions text,
  challenges_and_solutions text,
  outcomes_and_impact text,
  lessons_learned text,
  interview_talking_points text,
  owner_verified_at timestamp with time zone,
  last_reviewed_at timestamp with time zone,
  ai_draft jsonb default '{}'::jsonb not null,
  ai_draft_generated_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.project_briefs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_briefs' and policyname = 'Users can view own project briefs') then
    create policy "Users can view own project briefs" on public.project_briefs for select using (
      exists (select 1 from public.projects where projects.id = project_briefs.project_id and projects.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_briefs' and policyname = 'Users can insert own project briefs') then
    create policy "Users can insert own project briefs" on public.project_briefs for insert with check (
      exists (select 1 from public.projects where projects.id = project_briefs.project_id and projects.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_briefs' and policyname = 'Users can update own project briefs') then
    create policy "Users can update own project briefs" on public.project_briefs for update using (
      exists (select 1 from public.projects where projects.id = project_briefs.project_id and projects.user_id = auth.uid())
    ) with check (
      exists (select 1 from public.projects where projects.id = project_briefs.project_id and projects.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_briefs' and policyname = 'Users can delete own project briefs') then
    create policy "Users can delete own project briefs" on public.project_briefs for delete using (
      exists (select 1 from public.projects where projects.id = project_briefs.project_id and projects.user_id = auth.uid())
    );
  end if;
end;
$$;

commit;
