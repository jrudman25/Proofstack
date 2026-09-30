import { NextResponse } from 'next/server'
import { authenticateUser, getProviderToken, requireProject } from '@/lib/api-auth'
import { ApiError, apiErrorResponse, parseProjectId } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { indexProjectReadme } from '@/lib/index-readme'

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
    const indexed = await indexProjectReadme(
      { userId: auth.userId, supabase: auth.supabase, accessToken: providerToken },
      project,
    )
    return NextResponse.json(indexed ? { indexed: true } : { indexed: false, reason: 'no-readme' })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
