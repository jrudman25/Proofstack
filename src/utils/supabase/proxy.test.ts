import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { updateSession } from './proxy'

const io = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: (...args: unknown[]) => { io.create(...args); return { auth: { getUser: io.getUser } } } }))
beforeEach(() => {
  vi.clearAllMocks()
  io.getUser.mockResolvedValue({ data: { user: null } })
})
it.each(['/api', '/api/chat', '/api/sync', '/api/webhooks/github'])('lets %s authenticate in its own handler', async path => {
  const response = await updateSession(new NextRequest(`https://app.test${path}`))
  expect(response.headers.get('location')).toBeNull()
  expect(io.create).not.toHaveBeenCalled()
})
it('verifies a user before serving a protected page', async () => {
  const response = await updateSession(new NextRequest('https://app.test/projects'))
  expect(io.getUser).toHaveBeenCalledOnce()
  expect(response.headers.get('location')).toBe('https://app.test/login')
})
it('allows a verified user', async () => {
  io.getUser.mockResolvedValue({ data: { user: { id: 'alice' } } })
  const response = await updateSession(new NextRequest('https://app.test/projects'))
  expect(response.headers.get('location')).toBeNull()
})
it.each(['/login', '/auth/callback', '/auth/auth-code-error', '/privacy'])('allows public path %s', async path => {
  expect((await updateSession(new NextRequest(`https://app.test${path}`))).headers.get('location')).toBeNull()
})
it.each(['/u/octocat', '/u/OctoCat', '/u/a-1', '/u/a--b'])('serves public profile %s without session work', async path => {
  const response = await updateSession(new NextRequest(`https://app.test${path}`))
  expect(response.status).toBe(200)
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  expect(io.create).not.toHaveBeenCalled()
})
it.each(['/u/not_valid', '/u/-bad', '/u/%E2%9C%93'])('rewrites unroutable profile slug %s to a real 404', async path => {
  const response = await updateSession(new NextRequest(`https://app.test${path}`))
  expect(response.status).toBe(404)
  expect(response.headers.get('x-middleware-rewrite')).toMatch(/\/_profile-not-found$/)
  expect(io.create).not.toHaveBeenCalled()
})
it.each(['/robots.txt', '/sitemap.xml'])('serves crawler metadata %s without session work', async path => {
  const response = await updateSession(new NextRequest(`https://app.test${path}`))
  expect(response.headers.get('location')).toBeNull()
  expect(io.create).not.toHaveBeenCalled()
})
it('refreshes session state while keeping the help page public', async () => {
  const response = await updateSession(new NextRequest('https://app.test/help'))
  expect(response.headers.get('location')).toBeNull()
  expect(io.getUser).toHaveBeenCalledOnce()
})
