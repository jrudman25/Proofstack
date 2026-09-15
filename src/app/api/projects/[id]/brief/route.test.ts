import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET, PATCH } from './route'

const io = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), projectSingle: vi.fn(), briefSingle: vi.fn(), writeSingle: vi.fn(), update: vi.fn(), insert: vi.fn(), updateEq: vi.fn(), eval: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval } }))

const userId = '12345678-1234-1234-1234-123456789abc'
const projectId = '22345678-1234-1234-1234-123456789abc'
const context = { params: Promise.resolve({ id: projectId }) }
const project = { id: projectId, user_id: userId, name: 'Example', full_name: 'owner/Example' }
const brief = {
  project_id: projectId,
  visibility: 'private',
  lifecycle_status: 'active',
  purpose: 'Prepare developers for interviews',
  inspiration: null,
  role_and_contributions: null,
  architecture_and_decisions: null,
  challenges_and_solutions: null,
  outcomes_and_impact: null,
  lessons_learned: null,
  interview_talking_points: null,
  owner_verified_at: null,
  last_reviewed_at: null,
  ai_draft: {},
  ai_draft_generated_at: null,
  created_at: '2026-09-12T00:00:00.000Z',
  updated_at: '2026-09-12T00:00:00.000Z',
}
const body = {
  visibility: 'private',
  lifecycleStatus: 'active',
  ownerVerified: true,
  baseUpdatedAt: '2026-09-12T00:00:00.000Z',
  purpose: ' Prepare developers for interviews ',
  inspiration: '',
  role_and_contributions: '',
  architecture_and_decisions: '',
  challenges_and_solutions: '',
  outcomes_and_impact: '',
  lessons_learned: '',
  interview_talking_points: '',
}

function patch(value: unknown = body) {
  return new Request(`https://app.test/api/projects/${projectId}/brief`, { method: 'PATCH', body: JSON.stringify(value) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  io.eval.mockResolvedValue([1, 60])
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.projectSingle.mockResolvedValue({ data: project, error: null })
  io.briefSingle.mockResolvedValue({ data: brief, error: null })
  io.writeSingle.mockResolvedValue({ data: brief, error: null })
  // update().eq('project_id').eq('updated_at').select().maybeSingle()
  io.updateEq.mockImplementation(() => ({ eq: io.updateEq, select: () => ({ maybeSingle: io.writeSingle }) }))
  io.update.mockReturnValue({ eq: io.updateEq })
  io.insert.mockReturnValue({ select: () => ({ maybeSingle: io.writeSingle }) })
  const projectQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: io.projectSingle }
  const briefQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: io.briefSingle, update: io.update, insert: io.insert }
  io.from.mockImplementation((table: string) => table === 'projects' ? projectQuery : briefQuery)
})
afterEach(() => vi.unstubAllEnvs())

it('returns only the authenticated owner brief', async () => {
  const response = await GET(new Request(`https://app.test/api/projects/${projectId}/brief`), context)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ brief })
  expect(io.from).toHaveBeenNthCalledWith(1, 'projects')
  expect(io.from).toHaveBeenNthCalledWith(2, 'project_briefs')
})

it('normalizes and updates an owner-reviewed brief when the base version matches', async () => {
  const response = await PATCH(patch(), context)
  expect(response.status).toBe(200)
  expect(io.update).toHaveBeenCalledWith(expect.objectContaining({
    visibility: 'private',
    lifecycle_status: 'active',
    purpose: 'Prepare developers for interviews',
    inspiration: null,
    owner_verified_at: expect.any(String),
    last_reviewed_at: expect.any(String),
  }))
  expect(io.updateEq).toHaveBeenCalledWith('project_id', projectId)
  expect(io.updateEq).toHaveBeenCalledWith('updated_at', '2026-09-12T00:00:00.000Z')
})

it('inserts the first brief when none exists and no base version was claimed', async () => {
  io.briefSingle.mockResolvedValue({ data: null, error: null })
  const response = await PATCH(patch({ ...body, baseUpdatedAt: null }), context)
  expect(response.status).toBe(200)
  expect(io.insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: projectId, purpose: 'Prepare developers for interviews' }))
  expect(io.update).not.toHaveBeenCalled()
})

it.each([
  ['missing', { ...body, baseUpdatedAt: null }],
  ['stale', { ...body, baseUpdatedAt: '2026-09-11T00:00:00.000Z' }],
])('rejects a %s base version without overwriting the saved brief', async (_name, value) => {
  const response = await PATCH(patch(value), context)
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'This brief was updated elsewhere. Reload it before saving.' })
  expect(io.update).not.toHaveBeenCalled()
  expect(io.insert).not.toHaveBeenCalled()
})

it('treats a write that matches nothing as a conflict rather than a silent overwrite', async () => {
  io.writeSingle.mockResolvedValue({ data: null, error: null })
  const response = await PATCH(patch(), context)
  expect(response.status).toBe(409)
})

it('rejects inaccessible projects before brief access', async () => {
  io.projectSingle.mockResolvedValue({ data: null, error: null })
  const response = await PATCH(patch(), context)
  expect(response.status).toBe(404)
  expect(io.from).toHaveBeenCalledTimes(1)
  expect(io.update).not.toHaveBeenCalled()
  expect(io.insert).not.toHaveBeenCalled()
})

it.each([
  { ...body, visibility: 'shared' },
  { ...body, lifecycleStatus: 'unknown' },
  { ...body, purpose: 'x'.repeat(4001) },
  { ...body, ai_draft: { purpose: 'untrusted' } },
  { ...body, baseUpdatedAt: 'not-a-date' },
])('rejects malformed or protected fields before database access', async value => {
  const response = await PATCH(patch(value), context)
  expect(response.status).toBe(400)
  expect(io.from).not.toHaveBeenCalled()
})

it('rejects a body exceeding the shared total-size limit', async () => {
  const response = await PATCH(patch({
    ...body,
    purpose: 'x'.repeat(3500), inspiration: 'x'.repeat(3500), role_and_contributions: 'x'.repeat(3500),
    architecture_and_decisions: 'x'.repeat(3500), challenges_and_solutions: 'x'.repeat(3500),
    outcomes_and_impact: 'x'.repeat(3500),
  }), context)
  expect(response.status).toBe(400)
  expect(io.from).not.toHaveBeenCalled()
})

it.each(['GET', 'PATCH'])('fails closed on %s rate limit before database access', async method => {
  io.eval.mockResolvedValue([21, 45])
  const response = method === 'GET'
    ? await GET(new Request(`https://app.test/api/projects/${projectId}/brief`), context)
    : await PATCH(patch(), context)
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('45')
  expect(io.from).not.toHaveBeenCalled()
})

it('sanitizes rate-limit backend failures', async () => {
  io.eval.mockRejectedValue(new Error('secret-redis'))
  const response = await PATCH(patch(), context)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret-redis')
  expect(io.from).not.toHaveBeenCalled()
})

it('sanitizes database failures', async () => {
  io.briefSingle.mockResolvedValue({ data: null, error: new Error('private database details') })
  const response = await GET(new Request(`https://app.test/api/projects/${projectId}/brief`), context)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private database details')
})
