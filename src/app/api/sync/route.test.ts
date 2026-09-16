import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const io = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), from: vi.fn(), eval: vi.fn(), get: vi.fn(), set: vi.fn(), upsert: vi.fn(), update: vi.fn(), single: vi.fn(), storeToken: vi.fn(), getToken: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@/lib/github-token-store', () => ({ storeGithubToken: io.storeToken, getStoredGithubToken: io.getToken }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser, getSession: io.getSession }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval; get = io.get; set = io.set } }))
const userId = 'user-a'
const repos = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, name: `repo-${i}`, full_name: `owner/repo-${i}`, description: null,
  html_url: `https://github.com/owner/repo-${i}`, language: null, homepage: null, stargazers_count: 0, pushed_at: null,
  private: false, created_at: '2025-01-01T00:00:00Z' }))
const request = () => new Request('https://app.test/api/sync', { method: 'POST' })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.getSession.mockResolvedValue({ data: { session: { user: { id: userId }, provider_token: 'token' } }, error: null })
  io.eval.mockResolvedValue([1, 60])
  io.get.mockResolvedValue(null)
  io.single.mockResolvedValue({ data: { id: userId }, error: null })
  io.upsert.mockResolvedValue({ error: null })
  io.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: io.single, upsert: io.upsert, update: io.update })
  io.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/user') return new Response('{}', { headers: { 'x-oauth-scopes': 'public_repo, read:user' } })
    if (parsed.pathname.endsWith('/contents/package.json')) return new Response('', { status: 404 })
    if (parsed.pathname.endsWith('/contents')) return new Response(JSON.stringify([]))
    if (parsed.pathname.endsWith('/languages')) return new Response(JSON.stringify({}))
    const page = Number(parsed.searchParams.get('page'))
    return new Response(JSON.stringify(repos.slice((page - 1) * 100, page * 100)))
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('accepts a Vercel-style empty request stream', async () => {
  const response = await POST(new Request('https://app.test/api/sync', { method: 'POST', body: '' }))
  expect(response.status).toBe(200)
})
it('paginates and upserts bounded batches owned by the verified user', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ syncedCount: 205 })
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => new URL(String(url)).pathname === '/user/repos')).toHaveLength(3)
  expect(io.upsert.mock.calls.map(call => call[0].length)).toEqual([100, 100, 5])
  for (const [batch, options] of io.upsert.mock.calls) {
    expect(batch.every((row: { user_id: string }) => row.user_id === userId)).toBe(true)
    expect(options).toEqual({ onConflict: 'user_id,github_repo_id' })
  }
})
it('merges package, manifest, and language technologies with existing metadata', async () => {
  const profileQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: io.single, update: io.update }
  const projectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: [{ github_repo_id: 1, technologies: ['Custom Tool'] }], error: null }),
    upsert: io.upsert
  }
  io.from.mockImplementation((table: string) => table === 'profiles' ? profileQuery : projectQuery)
  vi.mocked(fetch).mockImplementation(async input => {
    const parsed = new URL(String(input))
    if (parsed.pathname.endsWith('/repo-0/contents/package.json')) {
      return new Response(JSON.stringify({ dependencies: { next: '15.5.24', react: '^19.0.0' } }))
    }
    if (parsed.pathname.endsWith('/contents/package.json')) return new Response('', { status: 404 })
    if (parsed.pathname.endsWith('/repo-0/contents')) {
      return new Response(JSON.stringify([
        { name: 'package.json', type: 'file' },
        { name: 'Dockerfile', type: 'file' },
        { name: 'README.md', type: 'file' },
      ]))
    }
    if (parsed.pathname.endsWith('/contents')) return new Response(JSON.stringify([]))
    if (parsed.pathname.endsWith('/repo-0/languages')) {
      return new Response(JSON.stringify({ TypeScript: 5000, CSS: 500 }))
    }
    if (parsed.pathname.endsWith('/languages')) return new Response(JSON.stringify({}))
    const page = Number(parsed.searchParams.get('page'))
    const slice = repos.slice((page - 1) * 100, page * 100)
      .map(repo => repo.name === 'repo-0' ? { ...repo, language: 'TypeScript' } : repo)
    return new Response(JSON.stringify(slice))
  })
  const response = await POST(request())
  expect(await response.json()).toMatchObject({ syncedCount: 205, packageJsonCount: 1 })
  // The primary language is carried by `language`, so it is not duplicated
  // into technologies; secondary languages are appended.
  expect(io.upsert.mock.calls[0][0][0]).toMatchObject({
    language: 'TypeScript',
    technologies: ['Custom Tool', 'Next.js', 'React', 'Docker', 'CSS'],
  })
})
it('prefers the encrypted stored token without consulting the transient provider session', async () => {
  io.getToken.mockResolvedValue('stored-token')
  expect((await POST(request())).status).toBe(200)
  expect(io.getToken).toHaveBeenCalledWith(userId)
  expect(io.getSession).not.toHaveBeenCalled()
  expect(io.storeToken).not.toHaveBeenCalled()
})
it.each([false, true])('reports only confirmed writes when a later batch fails (throw=%s)', async thrown => {
  io.upsert.mockResolvedValueOnce({ error: null })
  if (thrown) io.upsert.mockRejectedValueOnce(new Error('secret-database'))
  else io.upsert.mockResolvedValueOnce({ error: new Error('secret-database') })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Service temporarily unavailable', syncedCount: 100, packageJsonCount: 0 })
  expect(io.upsert).toHaveBeenCalledTimes(2)
})
it('imports private repositories only through the explicit connect flow', async () => {
  const privateRepo = { ...repos[0], id: 999, name: 'secret', full_name: 'owner/secret', html_url: 'https://github.com/owner/secret', private: true }
  vi.mocked(fetch).mockImplementation(async input => {
    const parsed = new URL(String(input))
    if (parsed.pathname === '/user') return new Response('{}', { headers: { 'x-oauth-scopes': 'repo, read:user' } })
    if (parsed.pathname.endsWith('/package.json')) return new Response('', { status: 404 })
    if (parsed.pathname.endsWith('/contents')) return new Response(JSON.stringify([]))
    if (parsed.pathname.endsWith('/languages')) return new Response(JSON.stringify({}))
    const page = Number(parsed.searchParams.get('page'))
    return new Response(JSON.stringify(page === 1 ? [repos[0], privateRepo] : []))
  })

  // A plain sync filters private repositories even though the token can see them,
  // so disconnecting stays disconnected until the owner connects again.
  const plain = await POST(request())
  expect(await plain.json()).toMatchObject({ syncedCount: 1 })
  expect(io.upsert.mock.calls[0][0].every((row: { is_private: boolean }) => !row.is_private)).toBe(true)
  expect(io.update).toHaveBeenCalledWith(expect.objectContaining({ github_private_scope: false }))

  io.upsert.mockClear()

  const connected = await POST(new Request('https://app.test/api/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectPrivate: true }),
  }))
  expect(await connected.json()).toMatchObject({ syncedCount: 2 })
  expect(io.upsert.mock.calls[0][0].some((row: { is_private: boolean }) => row.is_private)).toBe(true)
  expect(io.update).toHaveBeenCalledWith(expect.objectContaining({ github_private_scope: true }))
})
it('checks profile database errors before writes', async () => {
  io.single.mockResolvedValue({ data: { id: userId }, error: new Error('secret') })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Service temporarily unavailable', syncedCount: 0, packageJsonCount: 0 })
  expect(io.upsert).not.toHaveBeenCalled()
})
it('does not persist any page when a later GitHub page is malformed', async () => {
  vi.mocked(fetch).mockImplementation(async url => {
    const parsed = new URL(String(url))
    if (parsed.pathname === '/user') return new Response('{}')
    if (parsed.pathname === '/user/repos') {
      const page = Number(parsed.searchParams.get('page'))
      return new Response(JSON.stringify(page === 2 ? [{ id: 'invalid' }] : repos.slice((page - 1) * 100, page * 100)))
    }
    return new Response('', { status: 404 })
  })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ syncedCount: 0 })
  expect(io.upsert).not.toHaveBeenCalled()
  // The scope probe may cache its result; the repo catalog must not be.
  expect(io.set.mock.calls.every(([key]) => !String(key).includes('github-repos'))).toBe(true)
})
