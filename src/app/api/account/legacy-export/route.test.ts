import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET } from './route'

const io = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), eval: vi.fn(),
  todosRange: vi.fn(), milestonesRange: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval } }))

const userId = '12345678-1234-1234-1234-123456789abc'

const todoRow = {
  id: 't1', project_id: 'p1', task: 'Write docs', is_completed: false,
  created_at: '2026-01-02T00:00:00.000Z', projects: { name: 'Example', user_id: userId },
}
const milestoneRow = {
  id: 'm1', project_id: 'p1', title: 'Release', description: 'Ship it', status: 'pending',
  due_date: '2026-02-01T00:00:00.000Z', created_at: '2026-01-03T00:00:00.000Z',
  projects: { name: 'Example', user_id: userId },
}

const ownerFilters: Record<string, [string, unknown][]> = { todos: [], milestones: [] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  ownerFilters.todos = []
  ownerFilters.milestones = []
  io.eval.mockResolvedValue([1, 60])
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.todosRange.mockResolvedValue({ data: [todoRow], error: null })
  io.milestonesRange.mockResolvedValue({ data: [milestoneRow], error: null })
  io.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: (...args: unknown[]) => {
        ownerFilters[table]?.push(args as [string, unknown])
        return { order: () => ({ range: table === 'todos' ? io.todosRange : io.milestonesRange }) }
      },
    }),
  }))
})
afterEach(() => vi.unstubAllEnvs())

it('rejects unauthenticated requests before any database access', async () => {
  io.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })
  const response = await GET()
  expect(response.status).toBe(401)
  expect(io.from).not.toHaveBeenCalled()
})

it('fails closed on rate limit before database access', async () => {
  io.eval.mockResolvedValue([6, 45])
  const response = await GET()
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('45')
  expect(io.from).not.toHaveBeenCalled()
})

it('exports only the owner’s records mapped to the download shape with attachment headers', async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="proofstack-legacy-tasks.json"')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(ownerFilters.todos).toContainEqual(['projects.user_id', userId])
  expect(ownerFilters.milestones).toContainEqual(['projects.user_id', userId])
  const body = await response.json()
  expect(body.exportedAt).toEqual(expect.any(String))
  expect(body.tasks).toEqual([{
    id: 't1', projectId: 'p1', projectName: 'Example',
    task: 'Write docs', completed: false, createdAt: '2026-01-02T00:00:00.000Z',
  }])
  expect(body.milestones).toEqual([{
    id: 'm1', projectId: 'p1', projectName: 'Example', title: 'Release',
    description: 'Ship it', status: 'pending', dueDate: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-01-03T00:00:00.000Z',
  }])
})

it('normalizes a one-element array project relation and null milestone fields', async () => {
  io.todosRange.mockResolvedValue({ data: [{ ...todoRow, projects: [{ name: 'ArrayForm', user_id: userId }] }], error: null })
  io.milestonesRange.mockResolvedValue({ data: [{ ...milestoneRow, description: null, due_date: null }], error: null })
  const body = await (await GET()).json()
  expect(body.tasks[0].projectName).toBe('ArrayForm')
  expect(body.milestones[0].description).toBeNull()
  expect(body.milestones[0].dueDate).toBeNull()
})

it('pages through all rows in inclusive 1000-row ranges', async () => {
  io.todosRange
    .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ ...todoRow, id: `t${i}` })), error: null })
    .mockResolvedValueOnce({ data: [todoRow], error: null })
  const body = await (await GET()).json()
  expect(io.todosRange.mock.calls).toEqual([[0, 999], [1000, 1999]])
  expect(body.tasks).toHaveLength(1001)
})

it('sanitizes database failures', async () => {
  io.todosRange.mockResolvedValue({ data: null, error: new Error('secret database details') })
  const response = await GET()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret database details')
})
