import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET, PATCH } from './route'

const io = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), projectSingle: vi.fn(), briefSingle: vi.fn(), upsert: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser }, from: io.from }) }))

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
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.projectSingle.mockResolvedValue({ data: project, error: null })
  io.briefSingle.mockResolvedValue({ data: brief, error: null })
  const projectQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: io.projectSingle }
  const briefQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: io.briefSingle, upsert: io.upsert }
  io.upsert.mockReturnValue(briefQuery)
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

it('normalizes and upserts an owner-reviewed brief', async () => {
  const response = await PATCH(patch(), context)
  expect(response.status).toBe(200)
  expect(io.upsert).toHaveBeenCalledWith(expect.objectContaining({
    project_id: projectId,
    visibility: 'private',
    lifecycle_status: 'active',
    purpose: 'Prepare developers for interviews',
    inspiration: null,
    owner_verified_at: expect.any(String),
    last_reviewed_at: expect.any(String),
  }), { onConflict: 'project_id' })
})

it('rejects inaccessible projects before brief access', async () => {
  io.projectSingle.mockResolvedValue({ data: null, error: null })
  const response = await PATCH(patch(), context)
  expect(response.status).toBe(404)
  expect(io.from).toHaveBeenCalledTimes(1)
  expect(io.upsert).not.toHaveBeenCalled()
})

it.each([
  { ...body, visibility: 'shared' },
  { ...body, lifecycleStatus: 'unknown' },
  { ...body, purpose: 'x'.repeat(4001) },
  { ...body, ai_draft: { purpose: 'untrusted' } },
])('rejects malformed or protected fields before database access', async value => {
  const response = await PATCH(patch(value), context)
  expect(response.status).toBe(400)
  expect(io.from).not.toHaveBeenCalled()
})

it('sanitizes database failures', async () => {
  io.briefSingle.mockResolvedValue({ data: null, error: new Error('private database details') })
  const response = await GET(new Request(`https://app.test/api/projects/${projectId}/brief`), context)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private database details')
})
