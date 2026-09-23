begin;

set local search_path = public, pg_temp;

-- Owner opt-out from automated unclaimed-profile analysis of their public
-- GitHub data. The default keeps analysis available for usernames that have
-- no claimed or published profile; only a signed-in owner can exclude their
-- GitHub username. Analysis itself is generated from public GitHub data into
-- a bounded Redis cache and is never stored on the profile.
alter table public.profiles
  add column if not exists unclaimed_analysis_opt_out boolean not null default false;

commit;
