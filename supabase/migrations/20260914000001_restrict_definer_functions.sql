begin;

set local search_path = public, pg_temp;

-- Supabase security advisors flag both functions as callable by anon and
-- authenticated roles through the exposed API schema. Neither function is
-- invoked by clients: handle_new_user runs only from the auth trigger and
-- rls_auto_enable is a platform helper. Revoking EXECUTE leaves trigger and
-- platform behavior intact.
revoke all on function public.handle_new_user() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0) then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

commit;
