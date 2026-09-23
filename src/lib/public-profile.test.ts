import { beforeEach, expect, it, vi } from 'vitest'
import { buildPublicBriefingSnapshot, getPublicProfile, getPublishedProfileSlugs } from './public-profile'

const io = vi.hoisted(() => ({ from: vi.fn(), profileResult: vi.fn(), projectResult: vi.fn(), calls: [] as { method: string; args: unknown[] }[] }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ from: io.from }) }))

const profile = {
  id: '12345678-1234-1234-1234-123456789abc',
  github_username: 'octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  full_name: 'Octo Cat',
  public_slug: 'octocat',
  profile_published_at: '2026-09-20T00:00:00.000Z',
  public_briefing: null,
  public_briefing_published_at: null,
}

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: '22345678-1234-1234-1234-123456789abc',
  name: 'repolio', full_name: 'octocat/repolio',
  description: 'Portfolio intelligence', html_url: 'https://github.com/octocat/repolio', homepage: null,
  language: 'TypeScript', technologies: ['next', 'react'], stargazers_count: 12,
  pushed_at: '2026-09-19T00:00:00.000Z', github_created_at: '2024-01-01T00:00:00Z',
  is_private: false, github_fork: false, github_owner_login: 'octocat', github_owner_type: 'User',
  github_deleted_at: null,
  project_briefs: {
    visibility: 'public',
    published_fields: ['purpose', 'role_and_contributions'],
    lifecycle_status: 'active',
    purpose: 'Help developers explain their work',
    inspiration: 'should not be published',
    role_and_contributions: 'Built it solo',
    architecture_and_decisions: 'unpublished architecture',
    challenges_and_solutions: null,
    outcomes_and_impact: null,
    lessons_learned: null,
    owner_verified_at: '2026-09-18T00:00:00.000Z',
  },
  // Raw private evidence and internal bookkeeping that must never leak.
  summary: 'legacy raw summary', user_id: profile.id, github_repo_id: 42,
  ...overrides,
})

// Any PostgREST-style chain resolves through the same thenable so tests record
// the exact filters sent to the database.
function query(result: () => { data: unknown; error: unknown }) {
  const chain: Record<string | symbol, unknown> = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => { io.calls.push({ method: String(prop), args: [] }); return Promise.resolve(result()) }
      }
      return (...args: unknown[]) => { io.calls.push({ method: String(prop), args }); return chain }
    },
  })
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
  io.calls = []
  io.profileResult.mockReturnValue({ data: profile, error: null })
  io.projectResult.mockReturnValue({ data: [projectRow()], error: null })
  io.from.mockImplementation((table: string) => query(table === 'profiles' ? io.profileResult : io.projectResult))
})

it('returns null for unpublished or missing profiles without touching projects', async () => {
  io.profileResult.mockReturnValue({ data: null, error: null })
  expect(await getPublicProfile('octocat')).toBeNull()
  expect(io.from).toHaveBeenCalledTimes(1)
  expect(io.from).toHaveBeenCalledWith('profiles')
})

it.each(['', 'Bad Slug!', 'a'.repeat(40), '-leading', 'trailing-', 'under_score'])('rejects invalid slug %p before any query', async slug => {
  expect(await getPublicProfile(slug)).toBeNull()
  expect(io.from).not.toHaveBeenCalled()
})

it('looks up slugs case-insensitively and requires the published flag in the query', async () => {
  await getPublicProfile('OctoCat')
  const eqs = io.calls.filter(call => call.method === 'eq').map(call => call.args)
  expect(eqs).toContainEqual(['public_slug', 'octocat'])
  expect(eqs).toContainEqual(['profile_published', true])
})

it('constrains the project query to the owner, public repositories, and selected briefs', async () => {
  await getPublicProfile('octocat')
  const projectCalls = io.calls.slice(io.calls.findIndex(call => call.method === 'select' && String(call.args[0]).includes('project_briefs')))
  const eqs = projectCalls.filter(call => call.method === 'eq').map(call => call.args)
  expect(eqs).toContainEqual(['user_id', profile.id])
  expect(eqs).toContainEqual(['is_private', false])
  expect(eqs).toContainEqual(['project_briefs.visibility', 'public'])
  const ises = projectCalls.filter(call => call.method === 'is').map(call => call.args)
  expect(ises).toContainEqual(['github_deleted_at', null])
})

it('returns only published brief fields and never leaks raw evidence or internal ids', async () => {
  const result = await getPublicProfile('octocat')
  expect(result).not.toBeNull()
  const [project] = result!.projects
  expect(project.brief).toEqual({
    purpose: 'Help developers explain their work',
    role_and_contributions: 'Built it solo',
  })
  expect(project.ownerReviewed).toBe(true)
  // The serialized response must not contain any field outside the public
  // contract, including fields the database row happened to carry.
  const serialized = JSON.stringify(result)
  for (const forbidden of ['interview_talking_points', 'ai_draft', 'summary', 'user_id', 'github_repo_id',
    'is_private', 'ai_opt_in', 'embedding', 'unpublished architecture', 'should not be published', 'legacy raw summary']) {
    expect(serialized).not.toContain(forbidden)
  }
  expect(Object.keys(project).sort()).toEqual([
    'brief', 'description', 'fullName', 'githubCreatedAt', 'homepage', 'language', 'name',
    'ownerReviewed', 'pushedAt', 'repository', 'stargazersCount', 'technologies', 'url',
  ])
})

it('drops rows that arrive marked private, tombstoned, or unselected even if the query slipped', async () => {
  io.projectResult.mockReturnValue({
    data: [
      projectRow(),
      projectRow({ id: 'aaa45678-1234-1234-1234-123456789abc', is_private: true, name: 'private-repo' }),
      projectRow({ id: 'bbb45678-1234-1234-1234-123456789abc', name: 'unselected', project_briefs: { ...projectRow().project_briefs, visibility: 'private' } }),
      projectRow({ id: 'ddd45678-1234-1234-1234-123456789abc', name: 'deleted-repo', github_deleted_at: '2026-09-24T00:00:00.000Z' }),
    ],
    error: null,
  })
  const result = await getPublicProfile('octocat')
  expect(result!.projects.map(project => project.name)).toEqual(['repolio'])
})

it('omits a field whose publication was revoked even when the brief row still holds text', async () => {
  io.projectResult.mockReturnValue({
    data: [projectRow({ project_briefs: { ...projectRow().project_briefs, published_fields: [] } })],
    error: null,
  })
  const result = await getPublicProfile('octocat')
  expect(result!.projects[0].brief).toEqual({})
})

it('resolves briefing references only against published projects', async () => {
  const unpublishedId = 'ccc45678-1234-1234-1234-123456789abc'
  io.profileResult.mockReturnValue({
    data: {
      ...profile,
      public_briefing: buildPublicBriefingSnapshot({
        summary: 'TypeScript developer',
        themes: [{ title: 'Web', detail: 'Frontend work', projectIds: [projectRow().id, unpublishedId] }],
        spotlights: [
          { projectId: projectRow().id, reason: 'Flagship', talkingPoints: ['Next.js 16'] },
          { projectId: unpublishedId, reason: 'Hidden', talkingPoints: ['secret'] },
        ],
        growth: 'Steady growth',
        evidenceGaps: ['owner-only'],
        interviewQuestions: ['owner-only'],
        citations: [
          { projectId: projectRow().id, name: 'repolio', url: 'https://github.com/octocat/repolio', evidence: ['github', 'owner'] },
          { projectId: unpublishedId, name: 'hidden', url: 'https://github.com/octocat/hidden', evidence: ['github'] },
        ],
      }),
      public_briefing_published_at: '2026-09-20T01:00:00.000Z',
    },
    error: null,
  })
  const result = await getPublicProfile('octocat')
  const briefing = result!.briefing!
  expect(briefing.summary).toBe('TypeScript developer')
  expect(briefing.themes[0].projects).toEqual([{ name: 'repolio', url: 'https://github.com/octocat/repolio' }])
  expect(briefing.spotlights.map(s => s.project.name)).toEqual(['repolio'])
  expect(briefing.citations.map(c => c.name)).toEqual(['repolio'])
  const serialized = JSON.stringify(result)
  for (const forbidden of ['evidenceGaps', 'interviewQuestions', 'owner-only', 'hidden', 'secret', unpublishedId]) {
    expect(serialized).not.toContain(forbidden)
  }
})

it('returns a profile without a briefing section when none is published', async () => {
  const result = await getPublicProfile('octocat')
  expect(result!.briefing).toBeNull()
})

it('treats a malformed stored snapshot as absent rather than leaking it', async () => {
  io.profileResult.mockReturnValue({ data: { ...profile, public_briefing: { summary: 42 } }, error: null })
  const result = await getPublicProfile('octocat')
  expect(result!.briefing).toBeNull()
})

it('sanitizes database failures', async () => {
  io.profileResult.mockReturnValue({ data: null, error: new Error('private database details') })
  await expect(getPublicProfile('octocat')).rejects.toThrow('Service temporarily unavailable')
})

it('lists published profile slugs with a bounded, ordered, non-null query', async () => {
  io.profileResult.mockReturnValue({ data: [{ public_slug: 'alpha' }, { public_slug: 'beta' }], error: null })
  expect(await getPublishedProfileSlugs()).toEqual(['alpha', 'beta'])
  expect(io.calls).toContainEqual({ method: 'select', args: ['public_slug'] })
  expect(io.calls).toContainEqual({ method: 'eq', args: ['profile_published', true] })
  expect(io.calls).toContainEqual({ method: 'not', args: ['public_slug', 'is', null] })
  expect(io.calls).toContainEqual({ method: 'order', args: ['public_slug', { ascending: true }] })
  expect(io.calls).toContainEqual({ method: 'limit', args: [49_999] })
})

it('drops stored slugs that are null or no longer match the slug pattern', async () => {
  io.profileResult.mockReturnValue({
    data: [{ public_slug: 'ok-slug' }, { public_slug: 'Bad Slug!' }, { public_slug: null }, { public_slug: 42 }],
    error: null,
  })
  expect(await getPublishedProfileSlugs()).toEqual(['ok-slug'])
})

it('sanitizes slug listing failures', async () => {
  io.profileResult.mockReturnValue({ data: null, error: new Error('private database details') })
  await expect(getPublishedProfileSlugs()).rejects.toThrow('Service temporarily unavailable')
})
