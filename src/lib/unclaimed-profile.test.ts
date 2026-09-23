import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  acquireUnclaimedLock, consumeUnclaimedBudget, getCachedUnclaimedAnalysis,
  getUnclaimedGate, parseUnclaimedAnalysis, setCachedUnclaimedAnalysis,
  UNCLAIMED_ANALYSIS_DAILY_LIMIT,
} from './unclaimed-profile'
import type { UnclaimedAnalysis } from '@/types'

const io = vi.hoisted(() => ({
  from: vi.fn(), gateLimit: vi.fn(),
  get: vi.fn(), set: vi.fn(), eval: vi.fn(), incr: vi.fn(), expire: vi.fn(),
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ from: io.from }) }))
vi.mock('@upstash/redis', () => ({
  Redis: class { get = io.get; set = io.set; eval = io.eval; incr = io.incr; expire = io.expire },
}))

const analysis: UnclaimedAnalysis = {
  username: 'octocat',
  summary: 'Builds TypeScript tools.',
  focusAreas: ['TypeScript'],
  notableProjects: [{ name: 'repolio', url: 'https://github.com/octocat/repolio', reason: 'Flagship' }],
  generatedAt: '2026-09-21T00:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  io.gateLimit.mockResolvedValue({ data: [], error: null })
  io.from.mockReturnValue({ select: () => ({ ilike: () => ({ limit: io.gateLimit }) }) })
})
afterEach(() => vi.unstubAllEnvs())

it('reports unclaimed when no profile matches the GitHub username', async () => {
  expect(await getUnclaimedGate('octocat')).toEqual({ status: 'unclaimed' })
})

it('reports claimed with the canonical slug when a published profile exists', async () => {
  io.gateLimit.mockResolvedValue({ data: [{ public_slug: 'octo', profile_published: true, unclaimed_analysis_opt_out: false }], error: null })
  expect(await getUnclaimedGate('OctoCat')).toEqual({ status: 'claimed', slug: 'octo' })
})

it('blocks analysis when the owner opted out, even while unpublished', async () => {
  io.gateLimit.mockResolvedValue({ data: [{ public_slug: null, profile_published: false, unclaimed_analysis_opt_out: true }], error: null })
  expect(await getUnclaimedGate('octocat')).toEqual({ status: 'blocked' })
})

it('keeps claimed-but-unpublished profiles analyzable by default', async () => {
  io.gateLimit.mockResolvedValue({ data: [{ public_slug: 'octocat', profile_published: false, unclaimed_analysis_opt_out: false }], error: null })
  expect(await getUnclaimedGate('octocat')).toEqual({ status: 'unclaimed' })
})

it('sanitizes gate lookup failures', async () => {
  io.gateLimit.mockResolvedValue({ data: null, error: new Error('private database details') })
  await expect(getUnclaimedGate('octocat')).rejects.toThrow('Service temporarily unavailable')
})

it('round-trips cached analysis and rejects malformed cache entries', async () => {
  io.get.mockResolvedValue(analysis)
  expect(await getCachedUnclaimedAnalysis('octocat')).toEqual(analysis)
  io.get.mockResolvedValue({ username: 'octocat', summary: 42 })
  expect(await getCachedUnclaimedAnalysis('octocat')).toBeNull()
  io.get.mockRejectedValue(new Error('redis down'))
  expect(await getCachedUnclaimedAnalysis('octocat')).toBeNull()
})

it('writes analysis to the bounded cache with a TTL', async () => {
  io.set.mockResolvedValue('OK')
  await setCachedUnclaimedAnalysis('octocat', analysis)
  expect(io.set).toHaveBeenCalledWith(expect.stringContaining('unclaimed-analysis'), analysis, { ex: 24 * 60 * 60 })
})

it('parses generated analysis and reattaches canonical repository URLs', () => {
  const repos = [
    { name: 'repolio', html_url: 'https://github.com/octocat/repolio' },
    { name: 'other', html_url: 'https://github.com/octocat/other' },
  ]
  const parsed = parseUnclaimedAnalysis(JSON.stringify({
    summary: ' TypeScript developer ',
    focusAreas: ['Tooling'],
    notableProjects: [{ name: 'repolio', reason: 'Primary project' }],
  }), 'octocat', repos)
  expect(parsed.username).toBe('octocat')
  expect(parsed.summary).toBe('TypeScript developer')
  expect(parsed.notableProjects[0].url).toBe('https://github.com/octocat/repolio')
  expect(Number.isFinite(Date.parse(parsed.generatedAt))).toBe(true)
})

it.each([
  { name: 'fabricated', reason: 'Not a real repository' },
  { name: 'REPOLIO', reason: 'Case changed' },
])('rejects a notable project the GitHub catalog does not contain: %p', async project => {
  await expect(async () => parseUnclaimedAnalysis(JSON.stringify({
    summary: 'Dev', focusAreas: [], notableProjects: [project],
  }), 'octocat', [{ name: 'repolio', html_url: 'https://github.com/octocat/repolio' }])).rejects.toThrow('Invalid analysis')
})

it('rejects oversized or malformed analysis output', async () => {
  await expect(async () => parseUnclaimedAnalysis(JSON.stringify({ summary: '', focusAreas: [], notableProjects: [] }), 'octocat', [])).rejects.toThrow('Invalid analysis')
  await expect(async () => parseUnclaimedAnalysis(JSON.stringify({ summary: 'ok', focusAreas: Array(7).fill('x'), notableProjects: [] }), 'octocat', [])).rejects.toThrow('Invalid analysis')
  await expect(async () => parseUnclaimedAnalysis('not json', 'octocat', [])).rejects.toThrow()
})

it('acquires and releases the per-username generation lock', async () => {
  io.set.mockResolvedValue('OK')
  io.eval.mockResolvedValue(1)
  const release = await acquireUnclaimedLock('octocat')
  expect(io.set).toHaveBeenCalledWith(expect.stringContaining('unclaimed-lock'), expect.any(String), { nx: true, ex: 120 })
  await release()
  expect(io.eval).toHaveBeenCalled()
})

it('fails fast when another generation already holds the lock', async () => {
  io.set.mockResolvedValue(null)
  await expect(acquireUnclaimedLock('octocat')).rejects.toMatchObject({ status: 429 })
})

it('enforces the daily generation budget', async () => {
  io.incr.mockResolvedValue(1)
  io.expire.mockResolvedValue(1)
  await expect(consumeUnclaimedBudget()).resolves.toBeUndefined()
  expect(io.expire).toHaveBeenCalled()
  io.incr.mockResolvedValue(UNCLAIMED_ANALYSIS_DAILY_LIMIT + 1)
  await expect(consumeUnclaimedBudget()).rejects.toMatchObject({ status: 503 })
})
