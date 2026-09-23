import { randomUUID } from 'node:crypto'
import { ApiError } from './api-validation'
import { enforceDailyBudget } from './rate-limit'
import { createRedis, redisKey, type UserContext } from './redis'
import { createAdminClient } from '@/utils/supabase/admin'
import type { UnclaimedAnalysis } from '@/types'

// Automated analysis of GitHub users who have not claimed a Proofstack
// profile. Everything here is temporary: results live only in a bounded
// Redis cache, are clearly labeled as automated and unclaimed on render, and
// never touch owner-verified content or the published-profile boundary.

export const UNCLAIMED_ANALYSIS_TTL_SECONDS = 24 * 60 * 60
export const UNCLAIMED_ANALYSIS_DAILY_LIMIT = 60
const UNCLAIMED_LOCK_TTL_SECONDS = 120

// Public lookups share one Redis namespace; the analysis is identical for
// every visitor, so the context is a constant rather than a viewer identity.
const PUBLIC_CONTEXT: UserContext = { userId: 'public' }

export type UnclaimedGate =
  | { status: 'claimed'; slug: string }
  | { status: 'blocked' }
  | { status: 'unclaimed' }

// Decides whether an automated preview may be offered for a GitHub username.
// A claimed and published profile always wins and reports its canonical slug;
// an owner who set unclaimed_analysis_opt_out blocks analysis entirely,
// including the claimed-but-unpublished case. Uses the service-role client,
// so the projection and filters here are the complete access policy.
export async function getUnclaimedGate(username: string): Promise<UnclaimedGate> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles')
    .select('public_slug, profile_published, unclaimed_analysis_opt_out')
    .ilike('github_username', username)
    .limit(2)
  if (error) throw new ApiError(503, 'Service temporarily unavailable')
  const rows = (data || []) as { public_slug: string | null; profile_published: boolean; unclaimed_analysis_opt_out: boolean }[]
  if (rows.some(row => row.unclaimed_analysis_opt_out)) return { status: 'blocked' }
  const published = rows.find(row => row.profile_published && row.public_slug)
  if (published) return { status: 'claimed', slug: published.public_slug! }
  return { status: 'unclaimed' }
}

function isAnalysis(value: unknown): value is UnclaimedAnalysis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const analysis = value as Record<string, unknown>
  return typeof analysis.username === 'string'
    && typeof analysis.summary === 'string'
    && typeof analysis.generatedAt === 'string'
    && Array.isArray(analysis.focusAreas) && analysis.focusAreas.every(item => typeof item === 'string')
    && Array.isArray(analysis.notableProjects) && analysis.notableProjects.every(item =>
      item && typeof item === 'object' && !Array.isArray(item)
      && typeof (item as Record<string, unknown>).name === 'string'
      && typeof (item as Record<string, unknown>).url === 'string'
      && typeof (item as Record<string, unknown>).reason === 'string')
}

export async function getCachedUnclaimedAnalysis(username: string): Promise<UnclaimedAnalysis | null> {
  try {
    const cached = await createRedis().get(redisKey(PUBLIC_CONTEXT, 'unclaimed-analysis', username))
    return isAnalysis(cached) ? cached : null
  } catch {
    return null
  }
}

export async function setCachedUnclaimedAnalysis(username: string, analysis: UnclaimedAnalysis): Promise<void> {
  try {
    await createRedis().set(redisKey(PUBLIC_CONTEXT, 'unclaimed-analysis', username), analysis, { ex: UNCLAIMED_ANALYSIS_TTL_SECONDS })
  } catch {
    // A failed cache write only costs a regeneration on the next request.
  }
}

// Serializes generation per username so concurrent visitors cannot trigger
// duplicate GitHub and Gemini work. Throws 429 while a generation is running.
export async function acquireUnclaimedLock(username: string): Promise<() => Promise<void>> {
  const redis = createRedis()
  const key = redisKey(PUBLIC_CONTEXT, 'unclaimed-lock', username)
  const token = randomUUID()
  let acquired: unknown
  try {
    acquired = await redis.set(key, token, { nx: true, ex: UNCLAIMED_LOCK_TTL_SECONDS })
  } catch {
    throw new ApiError(503, 'Service temporarily unavailable')
  }
  if (acquired === null) throw new ApiError(429, 'Analysis is already being generated; try again shortly', 15)
  if (acquired !== 'OK') throw new ApiError(503, 'Service temporarily unavailable')
  return async () => {
    try { await redis.eval(`if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`, [key], [token]) }
    catch { /* an expired lock needs no release */ }
  }
}

// Global generation budget: bounds daily Gemini spend regardless of how many
// distinct visitors or usernames are involved. Throws 503 once exhausted.
export function consumeUnclaimedBudget(): Promise<void> {
  return enforceDailyBudget('unclaimed-analysis', UNCLAIMED_ANALYSIS_DAILY_LIMIT)
}

export const UNCLAIMED_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'focusAreas', 'notableProjects'],
  properties: {
    summary: { type: 'string' },
    focusAreas: { type: 'array', maxItems: 6, items: { type: 'string' } },
    notableProjects: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['name', 'reason'], properties: {
      name: { type: 'string' }, reason: { type: 'string' },
    } } },
  },
} as const

type RepoRef = { name: string; html_url: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid analysis')
  return value as Record<string, unknown>
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid analysis')
  return value.trim()
}

function texts(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error('Invalid analysis')
  return value.map(item => text(item, maxLength))
}

// Validates model output and reattaches canonical repository URLs from the
// fetched catalog so a fabricated or misspelled project name aborts the
// generation rather than reaching visitors.
export function parseUnclaimedAnalysis(value: string, username: string, repos: RepoRef[]): UnclaimedAnalysis {
  const root = object(JSON.parse(value))
  const byName = new Map(repos.map(repo => [repo.name, repo.html_url]))
  const notable = Array.isArray(root.notableProjects) && root.notableProjects.length <= 6
    ? root.notableProjects.map(item => {
      const project = object(item)
      const name = text(project.name, 200)
      const url = byName.get(name)
      if (!url) throw new Error('Invalid analysis')
      return { name, url, reason: text(project.reason, 600) }
    }) : (() => { throw new Error('Invalid analysis') })()
  return {
    username,
    summary: text(root.summary, 1200),
    focusAreas: texts(root.focusAreas, 6, 120),
    notableProjects: notable,
    generatedAt: new Date().toISOString(),
  }
}
