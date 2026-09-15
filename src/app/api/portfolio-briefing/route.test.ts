import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const io = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), eval: vi.fn(), generate: vi.fn(), projectLimit: vi.fn(), briefIn: vi.fn(), embedIn: vi.fn(), briefingUpsert: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval } }))
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: io.generate } } }))

const userId = '12345678-1234-1234-1234-123456789abc'
const projectId = '22345678-1234-1234-1234-123456789abc'
const projects = [{ id: projectId, name: 'Example', full_name: 'owner/Example', description: 'Example repo', html_url: 'https://github.com/owner/Example', language: 'TypeScript', technologies: ['React'], stargazers_count: 2, pushed_at: '2026-01-02', github_created_at: '2025-01-01', is_private: false, ai_opt_in: false }]
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
  io.embedIn.mockResolvedValue({ data: [{ project_id: projectId, metadata: { pushed_at: '2026-01-02' } }], error: null })
  io.briefingUpsert.mockResolvedValue({ error: null })
  io.from.mockImplementation((table: string) => {
    if (table === 'projects') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: io.projectLimit }
    if (table === 'project_briefs') return { select: vi.fn().mockReturnThis(), in: io.briefIn }
    if (table === 'project_embeddings') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: io.embedIn }
    return { upsert: io.briefingUpsert }
  })
  io.generate.mockResolvedValue({ text: generated })
})
afterEach(() => vi.unstubAllEnvs())

it('generates and persists an owner-scoped briefing with server-controlled citations', async () => {
  const response = await POST()
  expect(response.status).toBe(200)
  const { briefing, generatedAt } = await response.json()
  expect(typeof generatedAt).toBe('string')
  expect(briefing.citations).toEqual([{ projectId, name: 'Example', url: 'https://github.com/owner/Example', evidence: ['github', 'owner'] }])
  expect(io.from).toHaveBeenNthCalledWith(1, 'projects')
  expect(io.from).toHaveBeenNthCalledWith(2, 'project_briefs')
  expect(io.from).toHaveBeenNthCalledWith(3, 'project_embeddings')
  expect(io.from).toHaveBeenNthCalledWith(4, 'portfolio_briefings')
  const persisted = io.briefingUpsert.mock.calls[0][0]
  expect(persisted.user_id).toBe(userId)
  expect(persisted.briefing).toEqual(briefing)
  expect(persisted.evidence.projects).toEqual([{ id: projectId, pushed_at: '2026-01-02' }])
  const request = io.generate.mock.calls[0][0]
  expect(request.contents[0].parts[0].text).toContain('Interview preparation')
  expect(request.config.responseMimeType).toBe('application/json')
})

it('withholds private repositories from the AI payload unless opted in', async () => {
  const privateId = '32345678-1234-1234-1234-123456789abc'
  io.projectLimit.mockResolvedValue({
    data: [...projects, { ...projects[0], id: privateId, name: 'Secret', html_url: 'https://github.com/owner/Secret', is_private: true, ai_opt_in: false }],
    error: null, count: 2,
  })
  const response = await POST()
  expect(response.status).toBe(200)
  const payload = JSON.parse(io.generate.mock.calls[0][0].contents[0].parts[0].text)
  expect(payload.withheldPrivateProjects).toBe(1)
  expect(payload.untrustedPortfolioEvidence.map((entry: { projectId: string }) => entry.projectId)).toEqual([projectId])
})

it('rejects generation when every repository is private without consent', async () => {
  io.projectLimit.mockResolvedValue({
    data: [{ ...projects[0], is_private: true, ai_opt_in: false }],
    error: null, count: 1,
  })
  const response = await POST()
  expect(response.status).toBe(400)
  expect(io.generate).not.toHaveBeenCalled()
  expect(io.briefingUpsert).not.toHaveBeenCalled()
})

it('keeps the previous briefing when persistence fails after generation', async () => {
  io.briefingUpsert.mockResolvedValue({ error: new Error('secret') })
  const response = await POST()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret')
})

it('rejects fabricated project references from every model', async () => {
  io.generate.mockResolvedValue({ text: generated.replaceAll(projectId, 'attacker-project') })
  const response = await POST()
  expect(response.status).toBe(503)
  expect(io.generate).toHaveBeenCalledTimes(2)
  expect(await response.text()).not.toContain('attacker-project')
  expect(io.briefingUpsert).not.toHaveBeenCalled()
})

it('fails before portfolio access when authentication is missing', async () => {
  io.getUser.mockResolvedValue({ data: { user: null }, error: null })
  const response = await POST()
  expect(response.status).toBe(401)
  expect(io.from).not.toHaveBeenCalled()
  expect(io.generate).not.toHaveBeenCalled()
})
