begin;

set local search_path = public, pg_temp;

insert into public.project_briefs (project_id, ai_draft)
select
  projects.id,
  jsonb_build_object(
    'legacyReadmeSummary',
    jsonb_build_object(
      'content', projects.summary,
      'migratedAt', timezone('utc'::text, now())
    )
  )
from public.projects
where nullif(btrim(projects.summary), '') is not null
on conflict (project_id) do update
set ai_draft = case
  when public.project_briefs.ai_draft ? 'legacyReadmeSummary' then public.project_briefs.ai_draft
  else public.project_briefs.ai_draft || excluded.ai_draft
end;

do $$
begin
  if exists (
    select 1
    from public.projects
    join public.project_briefs on project_briefs.project_id = projects.id
    where nullif(btrim(projects.summary), '') is not null
      and project_briefs.ai_draft #>> '{legacyReadmeSummary,content}' is distinct from projects.summary
  ) then
    raise exception 'Legacy README summary preservation failed';
  end if;
end;
$$;

alter table public.projects drop column summary;

drop policy if exists "Users can insert own project milestones" on public.milestones;
drop policy if exists "Users can update own project milestones" on public.milestones;
drop policy if exists "Users can delete own project milestones" on public.milestones;
drop policy if exists "Users can insert own project todos" on public.todos;
drop policy if exists "Users can update own project todos" on public.todos;
drop policy if exists "Users can delete own project todos" on public.todos;

revoke insert, update, delete on table public.milestones from authenticated;
revoke insert, update, delete on table public.todos from authenticated;

commit;
