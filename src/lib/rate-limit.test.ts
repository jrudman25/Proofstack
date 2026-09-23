import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clientIpContext, enforceClientRateLimit, enforceDailyBudget, enforceRateLimit } from './rate-limit'
import { apiErrorResponse } from './api-validation'
import { redisKey } from './redis'

const evalIO = vi.hoisted(() => vi.fn())
const incrIO = vi.hoisted(() => vi.fn())
const expireIO = vi.hoisted(() => vi.fn())
vi.mock('@upstash/redis', () => ({ Redis: class { eval = evalIO; incr = incrIO; expire = expireIO } }))
beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  vi.stubEnv('VERCEL_ENV', 'preview')
  evalIO.mockReset().mockResolvedValue([1, 60])
  incrIO.mockReset().mockResolvedValue(1)
  expireIO.mockReset().mockResolvedValue(1)
})
afterEach(() => vi.unstubAllEnvs())
it('allows requests through the limit and returns TTL retry delay afterward', async () => {
  evalIO.mockResolvedValueOnce([20, 12]).mockResolvedValueOnce([21, 11])
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).resolves.toBeUndefined()
  const error = await enforceRateLimit({ userId: 'alice' }, 'chat').catch(e => e)
  const response = apiErrorResponse(error)
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('11')
})
it('isolates users, operations and environments without token-derived keys', async () => {
  await enforceRateLimit({ userId: 'alice' }, 'chat')
  await enforceRateLimit({ userId: 'bob' }, 'chat')
  await enforceRateLimit({ userId: 'alice' }, 'sync')
  vi.stubEnv('VERCEL_ENV', 'production')
  await enforceRateLimit({ userId: 'alice' }, 'chat')
  const keys = evalIO.mock.calls.map(call => call[1][0])
  expect(new Set(keys).size).toBe(4)
  expect(keys[0]).toBe('repolio:preview:rate-limit:alice:chat')
  expect(redisKey({ userId: 'a:b' }, 'cache', 'x/y')).not.toBe(redisKey({ userId: 'a' }, 'cache', 'b:x/y'))
})
it.each([null, [0, 60], [1, -1], ['1', 60], [1]])('fails closed for malformed Redis response %j', async value => {
  evalIO.mockResolvedValue(value)
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).rejects.toMatchObject({ status: 503 })
})
it('fails closed for missing configuration and transport errors', async () => {
  evalIO.mockRejectedValue(new Error('secret'))
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).rejects.toMatchObject({ status: 503, message: 'Service temporarily unavailable' })
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  evalIO.mockClear()
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).rejects.toMatchObject({ status: 503 })
  expect(evalIO).not.toHaveBeenCalled()
})

function ipRequest(headers: Record<string, string>) {
  return new Request('https://app.test/api/public-chat', { method: 'POST', headers, body: '{}' })
}

it('buckets anonymous clients by the platform client IP, not spoofed XFF entries', async () => {
  await enforceClientRateLimit(ipRequest({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '9.9.9.9' }), 'public-chat')
  await enforceClientRateLimit(ipRequest({ 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '9.9.9.9' }), 'public-chat')
  const keys = evalIO.mock.calls.map(call => call[1][0])
  expect(new Set(keys).size).toBe(1)
})

it('uses the last XFF entry when no platform IP is present', async () => {
  const withReal = clientIpContext(ipRequest({ 'x-real-ip': '9.9.9.9' }))
  const spoofedPrefix = clientIpContext(ipRequest({ 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }))
  const direct = clientIpContext(ipRequest({ 'x-forwarded-for': '9.9.9.9' }))
  expect(spoofedPrefix.userId).toBe(direct.userId)
  expect(spoofedPrefix.userId).toBe(withReal.userId)
  const other = clientIpContext(ipRequest({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8' }))
  expect(other.userId).not.toBe(direct.userId)
  expect(other.userId).toMatch(/^ip-[0-9a-f]{24}$/)
})

it('enforces the shared daily budget and sets a TTL on the first hit', async () => {
  await expect(enforceDailyBudget('public-chat', 300)).resolves.toBeUndefined()
  expect(expireIO).toHaveBeenCalled()
  incrIO.mockResolvedValue(301)
  await expect(enforceDailyBudget('public-chat', 300)).rejects.toMatchObject({ status: 503 })
})

it('fails the daily budget closed on Redis errors', async () => {
  incrIO.mockRejectedValue(new Error('redis down'))
  await expect(enforceDailyBudget('public-chat', 300)).rejects.toMatchObject({ status: 503 })
})
