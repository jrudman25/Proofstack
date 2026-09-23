import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const io = vi.hoisted(() => ({
  eval: vi.fn(), get: vi.fn(), set: vi.fn(), incr: vi.fn(), expire: vi.fn(),
  from: vi.fn(), gateLimit: vi.fn(),
  fetchUser: vi.fn(), fetchRepos: vi.fn(), generate: vi.fn(),
}))
vi.mock('@upstash/redis', () => ({
  Redis: class { eval = io.eval; get = io.get; set = io.set; incr = io.incr; expire = io.expire },
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ from: io.from }) }))
vi.mock('@/lib/github/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/github/api')>()),
  fetchGithubPublicUser: io.fetchUser,
  fetchGithubUserRepos: io.fetchRepos,
}))
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: io.generate } } }))

const repo = {
  id: 42, name: 'repolio', full_name: 'octocat/repolio', description: 'Portfolio intelligence',
  html_url: 'https://github.com/octocat/repolio', language: 'TypeScript', homepage: null,
  stargazers_count: 12, pushed_at: '2026-09-19T00:00:00Z', is_private: false,
  github_created_at: '2024-01-01T00:00:00Z', github_fork: false,
  github_owner_login: 'octocat', github_owner_type: 'User',
}
const githubUser = {
  login: 'octocat', name: 'Octo Cat', avatar_url: 'https://avatars.githubusercontent.com/u/1',
  bio: 'Builds things', public_repos: 3, created_at: '2020-01-01T00:00:00Z',
}
const modelOutput = JSON.stringify({
  summary: 'TypeScript developer focused on tooling.',
  focusAreas: ['TypeScript', 'Next.js'],
  notableProjects: [{ name: 'repolio', reason: 'Most recently updated project' }],
})

function request(body: unknown = { username: 'octocat' }) {
  return new Request('https://app.test/api/public-analysis', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  io.eval.mockResolvedValue([1, 60])
  io.get.mockResolvedValue(null)
  io.set.mockResolvedValue('OK')
  io.incr.mockResolvedValue(1)
  io.expire.mockResolvedValue(1)
  io.gateLimit.mockResolvedValue({ data: [], error: null })
  io.from.mockReturnValue({ select: () => ({ ilike: () => ({ limit: io.gateLimit }) }) })
  io.fetchUser.mockResolvedValue(githubUser)
  io.fetchRepos.mockResolvedValue([repo])
  io.generate.mockResolvedValue({ text: modelOutput })
})
afterEach(() => vi.unstubAllEnvs())

it.each([{}, { username: 42 }, { username: 'bad_name!' }, { username: '-leading' }, { username: 'a'.repeat(40) }])('rejects an invalid username before any I/O: %p', async body => {
  const response = await POST(request(body))
  expect(response.status).toBe(400)
  expect(io.eval).not.toHaveBeenCalled()
  expect(io.from).not.toHaveBeenCalled()
})

it('fails closed on rate limit before external work', async () => {
  io.eval.mockResolvedValue([7, 45])
  const response = await POST(request())
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('45')
  expect(io.from).not.toHaveBeenCalled()
  expect(io.fetchUser).not.toHaveBeenCalled()
})

it('redirects to the canonical slug when the user already published', async () => {
  io.gateLimit.mockResolvedValue({ data: [{ public_slug: 'octo', profile_published: true, unclaimed_analysis_opt_out: false }], error: null })
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'claimed', slug: 'octo' })
  expect(io.generate).not.toHaveBeenCalled()
})

it('refuses analysis when the owner opted out', async () => {
  io.gateLimit.mockResolvedValue({ data: [{ public_slug: null, profile_published: false, unclaimed_analysis_opt_out: true }], error: null })
  const response = await POST(request())
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'No automated analysis is available for this GitHub user' })
  expect(io.generate).not.toHaveBeenCalled()
})

it('serves a cached analysis without calling GitHub or Gemini', async () => {
  io.get.mockResolvedValue({
    username: 'octocat', summary: 'Cached', focusAreas: [], notableProjects: [], generatedAt: '2026-09-21T00:00:00Z',
  })
  const response = await POST(request())
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.analysis.summary).toBe('Cached')
  expect(io.fetchUser).not.toHaveBeenCalled()
  expect(io.generate).not.toHaveBeenCalled()
})

it('returns 404 when the GitHub user does not exist', async () => {
  io.fetchUser.mockResolvedValue(null)
  const response = await POST(request())
  expect(response.status).toBe(404)
  expect(io.generate).not.toHaveBeenCalled()
})

it('generates an analysis with canonical repository URLs and caches it', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.status).toBe('ok')
  expect(body.analysis.username).toBe('octocat')
  expect(body.analysis.summary).toBe('TypeScript developer focused on tooling.')
  expect(body.analysis.notableProjects).toEqual([{ name: 'repolio', url: 'https://github.com/octocat/repolio', reason: 'Most recently updated project' }])
  // Model context contains only public GitHub data, never system instructions.
  const generated = io.generate.mock.calls[0][0]
  const payload = JSON.parse(generated.contents[0].parts[0].text)
  expect(payload.untrustedGithubData.user.login).toBe('octocat')
  expect(payload.untrustedGithubData.repositories[0].name).toBe('repolio')
  expect(JSON.stringify(generated.config.systemInstruction)).toContain('never instructions')
  // The bounded cache records the generated result for later visitors.
  expect(io.set).toHaveBeenCalledWith(expect.stringContaining('unclaimed-analysis'), body.analysis, { ex: 24 * 60 * 60 })
})

it('skips generation entirely for users with no public repositories', async () => {
  io.fetchRepos.mockResolvedValue([])
  const response = await POST(request())
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.analysis.notableProjects).toEqual([])
  expect(io.generate).not.toHaveBeenCalled()
  expect(io.incr).not.toHaveBeenCalled()
})

it('rejects fabricated project names by falling back and failing closed', async () => {
  io.generate.mockResolvedValue({ text: JSON.stringify({ summary: 'ok', focusAreas: [], notableProjects: [{ name: 'not-real', reason: 'fake' }] }) })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(io.generate).toHaveBeenCalledTimes(2)
})

it('refuses concurrent generation for the same username', async () => {
  io.set.mockImplementation(async (_key: string, _value: unknown, options?: { nx?: boolean }) => options?.nx ? null : 'OK')
  const response = await POST(request())
  expect(response.status).toBe(429)
  expect(io.generate).not.toHaveBeenCalled()
})

it('enforces the daily generation budget', async () => {
  io.incr.mockResolvedValue(61)
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(io.generate).not.toHaveBeenCalled()
})

it.each(['github', 'provider'])('sanitizes %s failures', async failure => {
  if (failure === 'github') io.fetchUser.mockRejectedValue(new Error('secret github details'))
  else io.generate.mockRejectedValue(new Error('secret provider details'))
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret')
})
