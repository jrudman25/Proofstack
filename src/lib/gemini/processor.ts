import { createGeminiClient, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './client'

export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    // gemini-embedding-2 defaults to 3072 dimensions. Because it uses Matryoshka Representation Learning (MRL),
    // we can safely truncate it to 768 dimensions to remain compatible with our pgvector schema.
    const result = await createGeminiClient().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS }
    })
    const values = result.embeddings?.[0]?.values
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS ||
        !Array.from(values).every(value => typeof value === 'number' && Number.isFinite(value)) ||
        !values.some(value => value !== 0)) {
      throw new Error('Invalid embedding response')
    }
    return values
  } catch {
    console.error('Embedding generation unavailable')
    return null
  }
}
