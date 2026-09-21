import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PATCH } from './route'

const io = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), eval: vi.fn(),
  briefingSingle: vi.fn(), slugSingle: vi.fn(), updateSingle: vi.fn(), update: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval } }))

const userId = '12345678-1234-1234-1234-123456789abc'
const storedBriefing = {
  summary: 'TypeScript developer',
  themes: [{ title: 'Web', detail: 'Frontend work', projectIds: ['p1'] }],
  spotlights: [{ projectId: 'p1', reason: 'Flagship', talkingPoints: ['Next.js 16'] }],
  growth: 'Steady growth',
  evidenceGaps: ['private preparation only'],
  interviewQuestions: ['private preparation only'],
  citations: [{ projectId: 'p1', name: 'repolio', url: 'https://github.com/octocat/repolio', evidence: ['github'] }],
}
const profileResult = { public_slug: 'octocat', profile_published: true, profile_published_at: '2026-09-20T00:00:00.000Z', public_briefing_published_at: null }

function patch(value: unknown) {
  return new Request('https://app.test/api/profile', { method: 'PATCH', body: JSON.stringify(value) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  io.eval.mockResolvedValue([1, 60])
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.briefingSingle.mockResolvedValue({ data: { briefing: storedBriefing }, error: null })
  io.slugSingle.mockResolvedValue({ data: { public_slug: 'octocat' }, error: null })
  io.updateSingle.mockResolvedValue({ data: profileResult, error: null })
  io.update.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle: io.updateSingle }) }) })
  io.from.mockImplementation((table: string) => table === 'portfolio_briefings'
    ? { select: () => ({ eq: () => ({ maybeSingle: io.briefingSingle }) }) }
    : { select: () => ({ eq: () => ({ maybeSingle: io.slugSingle }) }), update: io.update })
})
afterEach(() => vi.unstubAllEnvs())

it('rejects unauthenticated requests', async () => {
  io.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })
  const response = await PATCH(patch({ published: true }))
  expect(response.status).toBe(401)
  expect(io.from).not.toHaveBeenCalled()
})

it.each([
  {},
  { theme: 'dark' },
  { slug: 42 },
  { slug: 'Bad Slug!' },
  { slug: '-leading' },
  { slug: 'a'.repeat(40) },
  { published: 'yes' },
  { publishBriefing: false },
])('rejects malformed settings before database access: %p', async value => {
  const response = await PATCH(patch(value))
  expect(response.status).toBe(400)
  expect(io.from).not.toHaveBeenCalled()
})

it('stores a normalized slug', async () => {
  const response = await PATCH(patch({ slug: '  Octo-Cat ' }))
  expect(response.status).toBe(200)
  expect(io.update).toHaveBeenCalledWith({ public_slug: 'octo-cat' })
})

it('maps a taken slug to 409', async () => {
  io.updateSingle.mockResolvedValue({ data: null, error: { code: '23505' } })
  const response = await PATCH(patch({ slug: 'taken' }))
  expect(response.status).toBe(409)
})

it('publishes using the stored slug and stamps the publication time', async () => {
  const response = await PATCH(patch({ published: true }))
  expect(response.status).toBe(200)
  expect(io.update).toHaveBeenCalledWith(expect.objectContaining({
    profile_published: true,
    profile_published_at: expect.any(String),
  }))
})

it('refuses to publish without any slug', async () => {
  io.slugSingle.mockResolvedValue({ data: { public_slug: null }, error: null })
  const response = await PATCH(patch({ published: true }))
  expect(response.status).toBe(400)
  expect(io.update).not.toHaveBeenCalled()
})

it('unpublishes without deleting the stored slug or briefing snapshot', async () => {
  const response = await PATCH(patch({ published: false }))
  expect(response.status).toBe(200)
  expect(io.update).toHaveBeenCalledWith({ profile_published: false, profile_published_at: null })
})

it('snapshots only the public-safe briefing sections', async () => {
  const response = await PATCH(patch({ publishBriefing: true }))
  expect(response.status).toBe(200)
  const snapshot = io.update.mock.calls[0][0].public_briefing
  expect(snapshot.summary).toBe('TypeScript developer')
  expect(snapshot.spotlights[0].projectId).toBe('p1')
  expect(JSON.stringify(snapshot)).not.toContain('evidenceGaps')
  expect(JSON.stringify(snapshot)).not.toContain('interviewQuestions')
  expect(JSON.stringify(snapshot)).not.toContain('private preparation only')
})

it('refuses to publish a briefing that does not exist', async () => {
  io.briefingSingle.mockResolvedValue({ data: null, error: null })
  const response = await PATCH(patch({ publishBriefing: true }))
  expect(response.status).toBe(400)
  expect(io.update).not.toHaveBeenCalled()
})

it('fails closed on rate limit before database access', async () => {
  io.eval.mockResolvedValue([6, 45])
  const response = await PATCH(patch({ published: true }))
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('45')
  expect(io.from).not.toHaveBeenCalled()
})

it('sanitizes database failures', async () => {
  io.updateSingle.mockResolvedValue({ data: null, error: new Error('secret database details') })
  const response = await PATCH(patch({ slug: 'octocat' }))
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret database details')
})
