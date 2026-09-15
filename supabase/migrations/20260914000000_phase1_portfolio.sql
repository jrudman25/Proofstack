begin;

set local search_path = public, pg_temp;

-- GitHub provenance and per-project AI consent. is_private mirrors GitHub
-- repository visibility; ai_opt_in gates sending private-repository content
-- to the AI provider. github_created_at preserves GitHub's repository
-- creation time separately from local import bookkeeping.
alter table public.projects
  add column if not exists is_private boolean not null default false,
  add column if not exists github_created_at timestamp with time zone,
  add column if not exists ai_opt_in boolean not null default false;

-- Catalog-sync bookkeeping kept separate from per-row updated_at writes, and
-- the recorded GitHub token capability so the interface can offer the
-- private-repository upgrade instead of silently missing repositories.
alter table public.profiles
  add column if not exists last_catalog_sync_at timestamp with time zone,
  add column if not exists github_private_scope boolean not null default false;

-- The latest generated portfolio briefing per user. evidence stores the
-- project ids and pushed_at values the briefing was built from so the
-- interface can report how many repositories changed since generation.
create table if not exists public.portfolio_briefings (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  briefing jsonb not null,
  generated_at timestamp with time zone not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.portfolio_briefings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'portfolio_briefings' and policyname = 'Users can view own portfolio briefings') then
    create policy "Users can view own portfolio briefings" on public.portfolio_briefings for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'portfolio_briefings' and policyname = 'Users can insert own portfolio briefings') then
    create policy "Users can insert own portfolio briefings" on public.portfolio_briefings for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'portfolio_briefings' and policyname = 'Users can update own portfolio briefings') then
    create policy "Users can update own portfolio briefings" on public.portfolio_briefings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'portfolio_briefings' and policyname = 'Users can delete own portfolio briefings') then
    create policy "Users can delete own portfolio briefings" on public.portfolio_briefings for delete using (auth.uid() = user_id);
  end if;
end;
$$;

commit;
