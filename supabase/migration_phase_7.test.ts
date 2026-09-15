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
