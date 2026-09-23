import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import sitemap from './sitemap'

const io = vi.hoisted(() => ({ from: vi.fn(), result: vi.fn(), calls: [] as { method: string; args: unknown[] }[] }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ from: io.from }) }))

function query(result: () => { data: unknown; error: unknown }) {
  const chain: Record<string | symbol, unknown> = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
      return (...args: unknown[]) => { io.calls.push({ method: String(prop), args }); return chain }
    },
  })
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
  io.calls = []
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://proofstack.example.com')
  io.result.mockReturnValue({ data: [{ public_slug: 'octo-cat' }], error: null })
  io.from.mockImplementation(() => query(io.result))
})
afterEach(() => vi.unstubAllEnvs())

it('lists the app root and every published profile under /u/', async () => {
  io.result.mockReturnValue({ data: [{ public_slug: 'alpha' }, { public_slug: 'beta' }], error: null })
  const entries = await sitemap()
  expect(entries.map(entry => entry.url)).toEqual([
    'https://proofstack.example.com',
    'https://proofstack.example.com/help',
    'https://proofstack.example.com/u/alpha',
    'https://proofstack.example.com/u/beta',
  ])
  expect(entries[0].priority).toBeGreaterThan(entries[1].priority ?? 0)
  expect(entries.every(entry => entry.lastModified === undefined)).toBe(true)
})

it('encodes slugs into profile URLs and omits unpublished or invalid rows', async () => {
  io.result.mockReturnValue({ data: [{ public_slug: 'ok-slug' }, { public_slug: 'Bad Slug!' }, { public_slug: null }], error: null })
  const entries = await sitemap()
  expect(entries.map(entry => entry.url)).toEqual([
    'https://proofstack.example.com',
    'https://proofstack.example.com/help',
    'https://proofstack.example.com/u/ok-slug',
  ])
})

it('queries only published, non-null slugs through the publication boundary', async () => {
  await sitemap()
  expect(io.calls).toContainEqual({ method: 'select', args: ['public_slug'] })
  expect(io.calls).toContainEqual({ method: 'eq', args: ['profile_published', true] })
  expect(io.calls).toContainEqual({ method: 'not', args: ['public_slug', 'is', null] })
})

it('propagates a sanitized failure when the slug listing is unavailable', async () => {
  io.result.mockReturnValue({ data: null, error: new Error('private database details') })
  await expect(sitemap()).rejects.toThrow('Service temporarily unavailable')
})
