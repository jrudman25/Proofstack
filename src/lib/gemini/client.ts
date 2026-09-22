import { GoogleGenAI } from '@google/genai'
import { getGeminiApiKey } from '@/lib/env-server'

export const GENERATION_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'] as const
export const EMBEDDING_MODEL = 'gemini-embedding-2'
export const EMBEDDING_DIMENSIONS = 768

export function createGeminiClient() {
  const apiKey = getGeminiApiKey()
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 60000, retryOptions: { attempts: 1 } } })
}

type GeminiClient = ReturnType<typeof createGeminiClient>
type GenerateRequest = Omit<Parameters<GeminiClient['models']['generateContent']>[0], 'model'>

export async function generateWithFallback<T>(
  ai: GeminiClient,
  request: GenerateRequest,
  parse: (text: string) => T,
  operation: string,
): Promise<T> {
  for (const model of GENERATION_MODELS) {
    try {
      const result = await ai.models.generateContent({ ...request, model })
      if (typeof result.text !== 'string') throw new Error('Invalid Gemini response')
      return parse(result.text)
    } catch {
      console.warn(`Model ${model} failed for ${operation}, falling back...`)
    }
  }
  throw new Error(`All Gemini models failed for ${operation}.`)
}
