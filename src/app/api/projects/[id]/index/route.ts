import { NextResponse } from 'next/server'
import { authenticateUser, getProviderToken, requireProject } from '@/lib/api-auth'
import { ApiError, apiErrorResponse, parseProjectId } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { acquireProcessingLock } from '@/lib/processing-lock'
import { fetchGithubReadme } from '@/lib/github/api'
import { generateEmbedding } from '@/lib/gemini/processor'

type RouteContext = { params: Promise<{ id: string }> }

// Indexes the repository README into project_embeddings for grounded chat and
// briefings. Private repositories require the owner's per-project AI consent
// before any repository content is sent to the provider.
export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await authenticateUser()
    const projectId = parseProjectId((await context.params).id)
    await enforceRateLimit(auth, 'project-index')
    const project = await requireProject(auth, projectId)
    if (project.is_private && !project.ai_opt_in) {
      throw new ApiError(403, 'Enable AI processing for this private repository before indexing it')
    }

    const providerToken = await getProviderToken(auth)
    const lock = await acquireProcessingLock(auth, projectId)
    try {
      const [owner, repo] = project.full_name.split('/')
      const readme = await fetchGithubReadme(owner, repo, { userId: auth.userId, accessToken: providerToken })
      if (!readme) return NextResponse.json({ indexed: false, reason: 'no-readme' })

      const readmeChunk = Array.from(readme).slice(0, 8000).join('')
      const embedding = await generateEmbedding(readmeChunk)
      if (!embedding?.length) throw new Error('Embedding unavailable')
      await lock.renew()

      const { error } = await auth.supabase.from('project_embeddings').upsert({
        project_id: projectId,
        source: 'readme',
        content: readmeChunk,
        embedding,
        metadata: { source: 'README', pushed_at: project.pushed_at }
      }, { onConflict: 'project_id,source' })
      if (error) throw error

      return NextResponse.json({ indexed: true })
    } finally {
      await lock.release()
    }
  } catch (error) {
    return apiErrorResponse(error)
  }
}
