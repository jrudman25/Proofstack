begin;

set local search_path = public, pg_temp;

-- Public profiles: a stable owner-chosen slug that survives GitHub renames, an
-- explicit publication switch, and a briefing snapshot so regenerating the
-- private briefing can never silently change published content.
alter table public.profiles
  add column if not exists public_slug text,
  add column if not exists profile_published boolean not null default false,
  add column if not exists profile_published_at timestamp with time zone,
  add column if not exists public_briefing jsonb,
  add column if not exists public_briefing_published_at timestamp with time zone;

update public.profiles
set public_slug = lower(github_username)
where public_slug is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_public_slug_format'
  ) then
    alter table public.profiles
      add constraint profiles_public_slug_format
      check (public_slug is null or public_slug ~ '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$');
  end if;
end;
$$;

-- Case-insensitive uniqueness; profiles without a slug stay exempt.
create unique index if not exists profiles_public_slug_key
  on public.profiles (lower(public_slug))
  where public_slug is not null;

-- Field-level publication: which owner-authored brief fields may appear when
-- the project is selected for the public profile. interview_talking_points is
-- private interview preparation and is never publishable.
alter table public.project_briefs
  add column if not exists published_fields text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_briefs'::regclass and conname = 'project_briefs_published_fields_allowed'
  ) then
    alter table public.project_briefs
      add constraint project_briefs_published_fields_allowed
      check (published_fields <@ array[
        'lifecycle_status', 'purpose', 'inspiration', 'role_and_contributions',
        'architecture_and_decisions', 'challenges_and_solutions', 'outcomes_and_impact', 'lessons_learned'
      ]::text[]);
  end if;
end;
$$;

-- Repository relationship is GitHub-derived and kept separate from the
-- owner-authored role_and_contributions on the brief.
alter table public.projects
  add column if not exists github_fork boolean not null default false,
  add column if not exists github_owner_login text,
  add column if not exists github_owner_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass and conname = 'projects_github_owner_type_check'
  ) then
    alter table public.projects
      add constraint projects_github_owner_type_check
      check (github_owner_type is null or github_owner_type in ('User', 'Organization'));
  end if;
end;
$$;

update public.projects
set github_owner_login = split_part(full_name, '/', 1)
where github_owner_login is null;

-- New signups start with their GitHub username as the default slug.
-- create or replace preserves the execute revokes applied earlier.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, github_username, avatar_url, full_name, public_slug)
  values (
    new.id,
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'full_name',
    lower(new.raw_user_meta_data->>'user_name')
  );
  return new;
end;
$$;

commit;
