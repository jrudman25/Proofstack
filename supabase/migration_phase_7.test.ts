import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const sql = (name: string) => readFileSync(resolve(process.cwd(), 'supabase', name), 'utf8').toLowerCase()
const migration = sql('migrations/20260906000000_production_hardening.sql')
const credentialsMigration = sql('migrations/20260909000000_github_credentials.sql')
const projectBriefsMigration = sql('migrations/20260912000000_project_briefs.sql')
const phase1Migration = sql('migrations/20260914000000_phase1_portfolio.sql')
const definerMigration = sql('migrations/20260914000001_restrict_definer_functions.sql')
const vectorMigration = sql('migrations/20260914000002_move_vector_extension.sql')
const consentSerializationMigration = sql('migrations/20260916000000_serialize_ai_consent_embeddings.sql')
const publicProfilesMigration = sql('migrations/20260920000000_public_profiles.sql')
const setup = sql('setup.sql')
const functions = sql('functions.sql')

it('keeps the migration transactional and free of row deletion or RLS weakening', () => {
  expect(migration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(migration).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdisable\s+row\s+level\s+security\b|\bdrop\s+policy\b/)
  expect(migration).toContain('raise exception')
  expect(migration).toContain("'readme:history:' || pe.id::text")
  expect(migration).toContain("'legacy:' || pe.id::text")
  expect(migration).toContain('order by created_at desc, id desc')
})
it('keeps GitHub credentials encrypted and inaccessible to browser roles', () => {
  for (const text of [setup, credentialsMigration]) {
    expect(text).toContain('github_credentials')
    expect(text).toContain('encrypted_token text not null')
    expect(text).toContain('enable row level security')
    expect(text).toMatch(/revoke all on table (?:public\.)?github_credentials from anon, authenticated/)
    expect(text).not.toMatch(/create policy[\s\S]*github_credentials/)
    expect(text).not.toMatch(/\bprovider_token\b|\baccess_token\b/)
  }
  expect(credentialsMigration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(credentialsMigration).toContain('on delete cascade')
})
it('adds owner-isolated project briefs without changing legacy project data', () => {
  for (const text of [setup, projectBriefsMigration]) {
    expect(text).toContain('project_briefs')
    expect(text).toContain("visibility in ('private', 'public')")
    expect(text).toContain("lifecycle_status in ('prototype', 'active', 'maintained', 'completed', 'archived')")
    expect(text).toContain("ai_draft jsonb default '{}'::jsonb not null")
    expect(text).toContain('enable row level security')
    expect(text).toMatch(/projects\.user_id = auth\.uid\(\)/)
  }
  expect(projectBriefsMigration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(projectBriefsMigration).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdisable\s+row\s+level\s+security\b|\bdrop\s+policy\b/)
  expect(projectBriefsMigration).toContain('create table if not exists')
  expect(projectBriefsMigration).toContain('if not exists (select 1 from pg_policies')
})
it('adds private-repository consent, GitHub provenance and persisted briefings without weakening RLS', () => {
  for (const text of [setup, phase1Migration]) {
    expect(text).toMatch(/is_private boolean (?:not null default false|default false not null)/)
    expect(text).toMatch(/ai_opt_in boolean (?:not null default false|default false not null)/)
    expect(text).toContain('github_created_at timestamp with time zone')
    expect(text).toContain('last_catalog_sync_at timestamp with time zone')
    expect(text).toMatch(/github_private_scope boolean (?:not null default false|default false not null)/)
    expect(text).toContain('portfolio_briefings')
    expect(text).toContain('enable row level security')
    expect(text).toMatch(/portfolio_briefings[\s\S]*auth\.uid\(\) = user_id/)
  }
  expect(phase1Migration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(phase1Migration).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdisable\s+row\s+level\s+security\b|\bdrop\s+policy\b/)
  expect(phase1Migration).toContain('add column if not exists')
  expect(phase1Migration).toContain('create table if not exists')
  expect(phase1Migration).toContain('if not exists (select 1 from pg_policies')
})
it('serializes embedding writes with private AI consent changes', () => {
  for (const text of [functions, consentSerializationMigration]) {
    expect(text).toContain('enforce_project_embedding_ai_consent')
    expect(text).toContain('delete_project_embeddings_on_ai_revoke')
    expect(text).toMatch(/where p\.id = new\.project_id\s+for update/)
    expect(text).toContain('project_private and not project_ai_opt_in')
    expect(text).toMatch(/before insert or update on public\.project_embeddings/)
    expect(text).toMatch(/after update of is_private, ai_opt_in on public\.projects/)
    expect(text).toMatch(/delete from public\.project_embeddings\s+where project_id = new\.id/)
    expect(text).toContain('old.ai_opt_in is distinct from new.ai_opt_in')
    expect(text).toContain('security invoker')
    expect(text).not.toContain('security definer')
    expect(text).toContain('revoke all on function public.enforce_project_embedding_ai_consent() from public, anon, authenticated')
    expect(text).toContain('revoke all on function public.delete_project_embeddings_on_ai_revoke() from public, anon, authenticated')
  }
  expect(consentSerializationMigration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
})
it('adds public-profile publication state, field controls and repository relationship without weakening RLS', () => {
  for (const text of [setup, publicProfilesMigration]) {
    expect(text).toContain('public_slug')
    expect(text).toMatch(/profile_published boolean (?:not null default false|default false not null)/)
    expect(text).toContain('public_briefing jsonb')
    expect(text).toContain('published_fields')
    expect(text).toContain('github_fork')
    expect(text).toContain('github_owner_login')
    expect(text).toContain('github_owner_type')
    // interview_talking_points is private interview preparation and can
    // never appear in the publishable-field allowlist.
    expect(text).not.toMatch(/published_fields <@ array\[[\s\S]*interview_talking_points/)
    // The public boundary reads through policies and the server client only:
    // no anonymous access is granted to profile or project rows.
    expect(text).not.toMatch(/create policy[\s\S]*?(?:to anon|using \(true\))/)
  }
  expect(publicProfilesMigration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(publicProfilesMigration).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdisable\s+row\s+level\s+security\b|\bdrop\s+policy\b|\bdrop\s+column\b/)
  expect(publicProfilesMigration).toContain('add column if not exists')
  expect(publicProfilesMigration).toContain('lower(github_username)')
  expect(publicProfilesMigration).toContain('lower(new.raw_user_meta_data')
  // Slug backfill precedes the format check so legacy rows cannot violate it.
  expect(publicProfilesMigration.indexOf('set public_slug = lower(github_username)')).toBeLessThan(publicProfilesMigration.indexOf('profiles_public_slug_format'))
})

it('revokes browser-role execution from security definer functions', () => {
  expect(definerMigration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(definerMigration).toContain('revoke all on function public.handle_new_user() from public, anon, authenticated')
  expect(definerMigration).toContain('revoke all on function public.rls_auto_enable() from public, anon, authenticated')
})
it('moves the vector extension out of the public schema', () => {
  expect(vectorMigration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(vectorMigration).toContain('alter extension vector set schema extensions')
  expect(setup).toContain('create extension if not exists vector with schema extensions')
})
it('aligns fresh setup and migration uniqueness, cosine search and indexes', () => {
  for (const text of [setup, migration]) {
    expect(text).toMatch(/github_repo_id (?:type )?bigint/)
    expect(text).toMatch(/unique\s*\(project_id, source\)/)
    expect(text).toContain('embedding vector_cosine_ops')
    expect(text).toContain('projects_github_repo_id_idx')
    expect(text).toContain('milestones_project_id_idx')
    expect(text).toContain('todos_project_id_idx')
    expect(text).toContain("set search_path = ''")
  }
  expect(migration).toContain("opc.opcname = 'vector_ip_ops'")
})
it.each(['match_project_embeddings', 'match_project_embeddings_for_project'])('keeps %s identical in deployed and standalone SQL with filtering before ranking', name => {
  const definition = (text: string) => {
    const match = text.match(new RegExp(`create or replace function (?:public\\.)?${name}\\s*\\(([\\s\\S]*?)\\$\\$;`))
    expect(match).not.toBeNull()
    return match![1].trim()
  }
  const standalone = definition(functions)
  expect(definition(migration)).toBe(standalone)
  const parameters = standalone.slice(0, standalone.indexOf('returns table')).replace(/\s+/g, ' ').trim()
  expect(parameters).toBe(`query_embedding vector(768), match_threshold float, match_count int, user_id_param uuid${name.endsWith('_for_project') ? ', project_id_param uuid' : ''} )`)
  expect(standalone).toContain('security invoker')
  expect(standalone).toContain('set search_path = public, extensions, pg_temp')
  expect(standalone).not.toContain('security definer')
  const where = standalone.slice(standalone.indexOf('where '), standalone.indexOf('order by '))
  expect(where).toContain('p.user_id = auth.uid()')
  expect(where).toContain('p.user_id = user_id_param')
  expect(where).toContain("pe.source not like 'readme:history:%'")
  expect(where).toContain('1 - (pe.embedding <=> query_embedding) > match_threshold')
  if (name.endsWith('_for_project')) expect(where).toContain('pe.project_id = project_id_param')
  else expect(standalone).not.toContain('project_id_param')
  expect(standalone).toMatch(/order by pe\.embedding <=> query_embedding\s+limit match_count;/)
  expect(migration.indexOf(`function public.${name} (`)).toBeLessThan(migration.lastIndexOf('commit;'))
  expect(migration).not.toMatch(/drop\s+function/i)
})
