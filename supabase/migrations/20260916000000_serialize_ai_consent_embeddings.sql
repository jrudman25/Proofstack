begin;

set local search_path = public, extensions, pg_temp;

create or replace function public.enforce_project_embedding_ai_consent()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  project_private boolean;
  project_ai_opt_in boolean;
begin
  select p.is_private, p.ai_opt_in
  into project_private, project_ai_opt_in
  from public.projects p
  where p.id = new.project_id
  for update;

  if found and project_private and not project_ai_opt_in then
    raise exception 'AI consent required for private project' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.delete_project_embeddings_on_ai_revoke()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.project_embeddings
  where project_id = new.id;

  return new;
end;
$$;

revoke all on function public.enforce_project_embedding_ai_consent() from public, anon, authenticated;
revoke all on function public.delete_project_embeddings_on_ai_revoke() from public, anon, authenticated;

drop trigger if exists enforce_project_embedding_ai_consent on public.project_embeddings;
create trigger enforce_project_embedding_ai_consent
  before insert or update on public.project_embeddings
  for each row execute function public.enforce_project_embedding_ai_consent();

drop trigger if exists delete_project_embeddings_on_ai_revoke on public.projects;
create trigger delete_project_embeddings_on_ai_revoke
  after update of is_private, ai_opt_in on public.projects
  for each row
  when (
    new.is_private
    and not new.ai_opt_in
    and (old.is_private is distinct from new.is_private or old.ai_opt_in is distinct from new.ai_opt_in)
  )
  execute function public.delete_project_embeddings_on_ai_revoke();

commit;
