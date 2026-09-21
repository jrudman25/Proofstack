-- Add this to setup.sql or run in SQL editor
-- The vector type lives in the extensions schema; resolve it for the
-- signatures below.
set search_path = public, extensions, pg_temp;

create or replace function match_project_embeddings (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  user_id_param uuid
)
returns table (
  id uuid,
  project_id uuid,
  content text,
  similarity float
)
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select
    pe.id,
    pe.project_id,
    pe.content,
    1 - (pe.embedding <=> query_embedding) as similarity
  from public.project_embeddings pe
  join public.projects p on p.id = pe.project_id
  where p.user_id = user_id_param
    and p.user_id = auth.uid()
    and pe.source not like 'readme:history:%'
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;

create or replace function public.match_project_embeddings_for_project (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  user_id_param uuid,
  project_id_param uuid
)
returns table (
  id uuid,
  project_id uuid,
  content text,
  similarity float
)
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select
    pe.id,
    pe.project_id,
    pe.content,
    1 - (pe.embedding <=> query_embedding) as similarity
  from public.project_embeddings pe
  join public.projects p on p.id = pe.project_id
  where p.user_id = user_id_param
    and p.user_id = auth.uid()
    and pe.project_id = project_id_param
    and pe.source not like 'readme:history:%'
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;

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
