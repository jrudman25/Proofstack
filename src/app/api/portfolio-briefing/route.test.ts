import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const io = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), eval: vi.fn(), generate: vi.fn(), projectLimit: vi.fn(), briefIn: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval } }))
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: io.generate } } }))

const userId = '12345678-1234-1234-1234-123456789abc'
const projectId = '22345678-1234-1234-1234-123456789abc'
const projects = [{ id: projectId, name: 'Example', full_name: 'owner/Example', description: 'Example repo', html_url: 'https://github.com/owner/Example', language: 'TypeScript', technologies: ['React'], stargazers_count: 2, pushed_at: '2026-01-02', created_at: '2025-01-01' }]
const generated = JSON.stringify({
  summary: 'A TypeScript portfolio.',
  themes: [{ title: 'Web engineering', detail: 'Uses React.', projectIds: [projectId] }],
  spotlights: [{ projectId, reason: 'Shows application design.', talkingPoints: ['Explain the architecture.'] }],
  growth: 'The evidence shows one current project.',
  evidenceGaps: ['Add outcome details.'],
  interviewQuestions: ['Why did you choose React?'],
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  vi.stubEnv('GEMINI_API_KEY', 'gemini-key')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-key')
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.eval.mockResolvedValue([1, 300])
  io.projectLimit.mockResolvedValue({ data: projects, error: null, count: 1 })
  io.briefIn.mockResolvedValue({ data: [{ project_id: projectId, lifecycle_status: 'active', purpose: 'Interview preparation', inspiration: null, role_and_contributions: null, architecture_and_decisions: null, challenges_and_solutions: null, outcomes_and_impact: null, lessons_learned: null, interview_talking_points: null, owner_verified_at: '2026-01-01' }], error: null })
  const projectQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: io.projectLimit }
  const briefQuery = { select: vi.fn().mockReturnThis(), in: io.briefIn }
  io.from.mockImplementation((table: string) => table === 'projects' ? projectQuery : briefQuery)
  io.generate.mockResolvedValue({ text: generated })
})
afterEach(() => vi.unstubAllEnvs())

it('generates an owner-scoped briefing with server-controlled citations', async () => {
  const response = await POST()
  expect(response.status).toBe(200)
  const { briefing } = await response.json()
  expect(briefing.citations).toEqual([{ projectId, name: 'Example', url: 'https://github.com/owner/Example', evidence: ['github', 'owner'] }])
  expect(io.from).toHaveBeenNthCalledWith(1, 'projects')
  expect(io.from).toHaveBeenNthCalledWith(2, 'project_briefs')
  const request = io.generate.mock.calls[0][0]
  expect(request.contents[0].parts[0].text).toContain('Interview preparation')
  expect(request.config.responseMimeType).toBe('application/json')
})

it('rejects fabricated project references from every model', async () => {
  io.generate.mockResolvedValue({ text: generated.replaceAll(projectId, 'attacker-project') })
  const response = await POST()
  expect(response.status).toBe(503)
  expect(io.generate).toHaveBeenCalledTimes(2)
  expect(await response.text()).not.toContain('attacker-project')
})

it('fails before portfolio access when authentication is missing', async () => {
  io.getUser.mockResolvedValue({ data: { user: null }, error: null })
  const response = await POST()
  expect(response.status).toBe(401)
  expect(io.from).not.toHaveBeenCalled()
  expect(io.generate).not.toHaveBeenCalled()
})
