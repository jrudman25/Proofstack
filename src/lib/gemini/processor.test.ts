import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateEmbedding } from './processor'

const io = vi.hoisted(() => ({ embed: vi.fn(), initialize: vi.fn() }))
// Mock the Gemini external module
vi.mock('@google/genai', () => ({ GoogleGenAI: class {
  constructor(options: unknown) { io.initialize(options) }
  models = { embedContent: io.embed }
} }))
const vector = Array(768).fill(0.1)
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  io.embed.mockResolvedValue({ embeddings: [{ values: vector }] })
})
afterEach(() => vi.unstubAllEnvs())

it('requests and preserves 768-dimensional embeddings', async () => {
  expect(await generateEmbedding('query')).toEqual(vector)
  expect(io.embed).toHaveBeenCalledWith({ model: 'gemini-embedding-2', contents: 'query', config: { outputDimensionality: 768 } })
})
it.each([
  {}, { embeddings: [] }, { embeddings: [{}] },
  ...[0, 3, 767, 769, 3072].map(length => ({ embeddings: [{ values: Array(length).fill(0.1) }] })),
  ...[NaN, Infinity, -Infinity, '1', null, undefined].map(value => ({ embeddings: [{ values: [...vector.slice(1), value] }] })),
  { embeddings: [{ values: Array(768).fill(0) }] },
  { embeddings: [{ values: Array(768) }] }
])('rejects malformed embeddings %# without truncating', async response => {
  io.embed.mockResolvedValue(response)
  expect(await generateEmbedding('query')).toBeNull()
})
it('returns null on provider failure without logging provider details', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    io.embed.mockRejectedValue(new Error('private-provider-detail'))
    expect(await generateEmbedding('query')).toBeNull()
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-provider-detail')
  } finally { log.mockRestore() }
})
it.each(['', '   '])('validates API key before initializing any client (%s)', async key => {
  vi.stubEnv('GEMINI_API_KEY', key)
  expect(await generateEmbedding('query')).toBeNull()
  expect(io.initialize).not.toHaveBeenCalled()
})
