import { NextResponse } from 'next/server'
import { authenticateUser, requireProject } from '@/lib/api-auth'
import { ApiError, apiErrorResponse, objectBody, parseProjectId, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

// Per-project AI consent for private repositories. Revoking consent also
// removes the project's embedded README evidence so private content does not
// linger in retrieval storage.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateUser()
    const projectId = parseProjectId((await context.params).id)
    const body = objectBody(await readJsonBody(request, 1024))
    if (Object.keys(body).some(key => key !== 'aiOptIn') || typeof body.aiOptIn !== 'boolean') {
      throw new ApiError(400, 'Invalid project settings')
    }
    await enforceRateLimit(auth, 'project-brief')
    const project = await requireProject(auth, projectId)
    if (!project.is_private) throw new ApiError(400, 'Only private repositories require AI consent')

    const { error } = await auth.supabase.from('projects')
      .update({ ai_opt_in: body.aiOptIn })
      .eq('id', projectId).eq('user_id', auth.userId)
    if (error) throw new ApiError(503, 'Service temporarily unavailable')

    if (!body.aiOptIn) {
      const { error: deleteError } = await auth.supabase.from('project_embeddings')
        .delete().eq('project_id', projectId)
      if (deleteError) throw new ApiError(503, 'Service temporarily unavailable')
    }

    return NextResponse.json({ aiOptIn: body.aiOptIn })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
