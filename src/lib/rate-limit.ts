import { createHash } from 'node:crypto'
import { ApiError } from './api-validation'
import { createRedis, redisKey, type UserContext } from './redis'

export const API_LIMITS = {
  chat: { limit: 20, windowSeconds: 60 },
  briefing: { limit: 5, windowSeconds: 300 },
  sync: { limit: 5, windowSeconds: 300 },
  'project-index': { limit: 10, windowSeconds: 300 },
  'project-brief': { limit: 20, windowSeconds: 60 },
  account: { limit: 5, windowSeconds: 300 },
  'public-chat': { limit: 10, windowSeconds: 60 },
  'public-analysis': { limit: 6, windowSeconds: 300 },
} as const

const script = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`

export async function enforceRateLimit(context: UserContext, operation: keyof typeof API_LIMITS): Promise<void> {
  const policy = API_LIMITS[operation]
  let result: unknown
  try {
    result = await createRedis().eval(script, [redisKey(context, 'rate-limit', operation)], [policy.windowSeconds])
  } catch {
    throw new ApiError(503, 'Service temporarily unavailable')
  }
  if (!Array.isArray(result) || result.length !== 2 || !Number.isSafeInteger(result[0]) || result[0] < 1
    || !Number.isSafeInteger(result[1]) || result[1] < 0) throw new ApiError(503, 'Service temporarily unavailable')
  if (result[0] > policy.limit) throw new ApiError(429, 'Too many requests', Math.max(1, result[1]))
}

// Unauthenticated endpoints share one rate-limit bucket per client IP. The
// raw address never reaches Redis: keys carry a truncated hash only.
export function clientIpContext(request: Request): UserContext {
  // x-forwarded-for is a client-influenced chain: earlier entries are
  // trivially spoofed, so only the platform-appended addresses are usable.
  // The edge sets x-real-ip to the direct client; otherwise the last XFF
  // entry is the closest thing to a trusted hop.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map(ip => ip.trim()).filter(Boolean) || []
  const client = request.headers.get('x-real-ip')?.trim() || forwarded[forwarded.length - 1] || 'unknown'
  const hash = createHash('sha256').update(client).digest('hex').slice(0, 24)
  return { userId: `ip-${hash}` }
}

export function enforceClientRateLimit(request: Request, operation: keyof typeof API_LIMITS): Promise<void> {
  return enforceRateLimit(clientIpContext(request), operation)
}

// Shared daily cost cap for unauthenticated features: bounds provider spend
// regardless of how many distinct IPs or usernames are involved. Exhaustion
// degrades the feature with a 503 rather than the bill.
export async function enforceDailyBudget(purpose: string, limit: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const key = redisKey({ userId: 'public' }, 'daily-budget', purpose, day)
  let count: unknown
  try {
    const redis = createRedis()
    count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 2 * 24 * 60 * 60)
  } catch {
    throw new ApiError(503, 'Service temporarily unavailable')
  }
  if (typeof count !== 'number' || count > limit) throw new ApiError(503, 'Service temporarily unavailable')
}
