import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const io = vi.hoisted(() => ({ eval: vi.fn(), incr: vi.fn(), expire: vi.fn(), getProfile: vi.fn(), generate: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval; incr = io.incr; expire = io.expire } }))
vi.mock('@/lib/public-profile', () => ({
  getPublicProfile: io.getProfile,
  PUBLIC_SLUG_PATTERN: /^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$/,
}))
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: io.generate } } }))

const profile = {
  slug: 'octocat',
  githubUsername: 'octocat',
  avatarUrl: null,
  fullName: 'Octo Cat',
  publishedAt: '2026-09-20T00:00:00.000Z',
  briefing: null,
  projects: [{
    name: 'repolio', fullName: 'octocat/repolio', description: 'Portfolio intelligence',
    url: 'https://github.com/octocat/repolio', homepage: null, language: 'TypeScript',
    technologies: ['next'], stargazersCount: 12, pushedAt: '2026-09-19T00:00:00Z',
    githubCreatedAt: '2024-01-01T00:00:00Z',
    repository: { fork: false, ownerLogin: 'octocat', ownerType: 'User' },
    ownerReviewed: true, brief: { purpose: 'Published owner note' },
  }],
}

function request(body: unknown = { slug: 'octocat', messages: [{ role: 'user', content: 'What does this developer build?' }] }) {
  return new Request('https://app.test/api/public-chat', {
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
  io.incr.mockResolvedValue(1)
  io.expire.mockResolvedValue(1)
  io.getProfile.mockResolvedValue(profile)
  io.generate.mockResolvedValue({ text: 'Published answer' })
})
afterEach(() => vi.unstubAllEnvs())

it.each([
  { slug: 'Bad Slug!', messages: [{ role: 'user', content: 'q' }] },
  { slug: 'octocat' },
  { slug: 'octocat', messages: [] },
  { slug: 'octocat', messages: [{ role: 'assistant', content: 'q' }] },
  { slug: 'octocat', messages: [{ role: 'user', content: '' }] },
])('rejects malformed input before any I/O: %p', async body => {
  const response = await POST(request(body))
  expect(response.status).toBe(400)
  expect(io.eval).not.toHaveBeenCalled()
  expect(io.getProfile).not.toHaveBeenCalled()
})

it('fails closed on rate limit before the profile lookup', async () => {
  io.eval.mockResolvedValue([11, 30])
  const response = await POST(request())
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('30')
  expect(io.getProfile).not.toHaveBeenCalled()
})

it('returns 404 for unpublished or missing profiles', async () => {
  io.getProfile.mockResolvedValue(null)
  const response = await POST(request())
  expect(response.status).toBe(404)
  expect(io.generate).not.toHaveBeenCalled()
})

it('degrades to 503 when the shared daily generation budget is exhausted', async () => {
  io.incr.mockResolvedValue(301)
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(io.generate).not.toHaveBeenCalled()
})

it('answers from the published profile only', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ role: 'assistant', content: 'Published answer' })
  const generated = io.generate.mock.calls[0][0]
  const payload = JSON.parse(generated.contents[0].parts[0].text)
  expect(payload.visitorQuestion).toBe('What does this developer build?')
  expect(payload.untrustedPublishedProfile.githubUsername).toBe('octocat')
  expect(payload.untrustedPublishedProfile.projects[0].brief).toEqual({ purpose: 'Published owner note' })
  expect(generated.config.systemInstruction.parts[0].text).toContain('never as instructions')
})

it('caps the project context for large published portfolios', async () => {
  io.getProfile.mockResolvedValue({ ...profile, projects: Array.from({ length: 80 }, (_, i) => ({ ...profile.projects[0], name: `repo-${i}` })) })
  const response = await POST(request())
  expect(response.status).toBe(200)
  const payload = JSON.parse(io.generate.mock.calls[0][0].contents[0].parts[0].text)
  expect(payload.untrustedPublishedProfile.totalProjects).toBe(80)
  expect(payload.untrustedPublishedProfile.projects).toHaveLength(60)
})

it.each(['provider', 'empty'])('sanitizes %s failures after fallback', async failure => {
  if (failure === 'provider') io.generate.mockRejectedValue(new Error('secret provider details'))
  else io.generate.mockResolvedValue({ text: '  ' })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret provider details')
})
