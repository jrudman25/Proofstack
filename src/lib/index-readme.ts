import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchGithubReadme } from './github/api'
import { generateEmbedding } from './gemini/processor'
import { acquireProcessingLock } from './processing-lock'

// README evidence is bounded so an oversized file cannot inflate embedding
// token spend or the pgvector payload.
const README_CHAR_LIMIT = 8000

// Indexes the repository README into project_embeddings for grounded chat
// and briefings. The caller must have verified project ownership and, for
// private repositories, the project's ai_opt_in consent. Returns false when
// the repository has no README.
export async function indexProjectReadme(
  context: { userId: string; supabase: SupabaseClient; accessToken: string | undefined },
  project: { id: string; full_name: string; pushed_at: string | null },
): Promise<boolean> {
  const lock = await acquireProcessingLock(context, project.id)
  try {
    const [owner, repo] = project.full_name.split('/')
    const readme = await fetchGithubReadme(owner, repo, { userId: context.userId, accessToken: context.accessToken })
    if (!readme) return false
    const readmeChunk = Array.from(readme).slice(0, README_CHAR_LIMIT).join('')
    const embedding = await generateEmbedding(readmeChunk)
    if (!embedding?.length) throw new Error('Embedding unavailable')
    await lock.renew()
    const { error } = await context.supabase.from('project_embeddings').upsert({
      project_id: project.id,
      source: 'readme',
      content: readmeChunk,
      embedding,
      metadata: { source: 'README', pushed_at: project.pushed_at }
    }, { onConflict: 'project_id,source' })
    if (error) throw error
    return true
  } finally {
    await lock.release()
  }
}
