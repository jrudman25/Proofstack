import { NextResponse } from 'next/server'
import { authenticateUser, requireProject } from '@/lib/api-auth'
import { apiErrorResponse, ApiError, parseProjectId, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { parseProjectBriefBody, PROJECT_BRIEF_COLUMNS, BRIEF_BODY_BYTES } from '@/lib/project-brief'

type RouteContext = { params: Promise<{ id: string }> }

async function projectIdFrom(context: RouteContext) {
  return parseProjectId((await context.params).id)
}

const STALE_MESSAGE = 'This brief was updated elsewhere. Reload it before saving.'

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await authenticateUser()
    const projectId = await projectIdFrom(context)
    await enforceRateLimit(auth, 'project-brief')
    await requireProject(auth, projectId)
    const { data: brief, error } = await auth.supabase.from('project_briefs')
      .select(PROJECT_BRIEF_COLUMNS).eq('project_id', projectId).maybeSingle()
    if (error) throw new ApiError(503, 'Service temporarily unavailable')
    return NextResponse.json({ brief: brief ?? null })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

// Writes are preconditioned on the updated_at the client loaded so a stale
// editor or second tab can never silently replace a newer saved brief.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateUser()
    const projectId = await projectIdFrom(context)
    const { ownerVerified, baseUpdatedAt, ...fields } = parseProjectBriefBody(await readJsonBody(request, BRIEF_BODY_BYTES))
    await enforceRateLimit(auth, 'project-brief')
    await requireProject(auth, projectId)

    const now = new Date().toISOString()
    const review = ownerVerified ? { owner_verified_at: now, last_reviewed_at: now } : { owner_verified_at: null }

    const { data: existing, error: readError } = await auth.supabase.from('project_briefs')
      .select('updated_at').eq('project_id', projectId).maybeSingle()
    if (readError) throw new ApiError(503, 'Service temporarily unavailable')

    if (existing) {
      if (!baseUpdatedAt || existing.updated_at !== baseUpdatedAt) throw new ApiError(409, STALE_MESSAGE)
      const { data: brief, error } = await auth.supabase.from('project_briefs').update({
        ...fields,
        ...review,
        updated_at: now,
      }).eq('project_id', projectId).eq('updated_at', baseUpdatedAt).select(PROJECT_BRIEF_COLUMNS).maybeSingle()
      if (error) throw new ApiError(503, 'Service temporarily unavailable')
      if (!brief) throw new ApiError(409, STALE_MESSAGE)
      return NextResponse.json({ brief })
    }

    if (baseUpdatedAt) throw new ApiError(409, STALE_MESSAGE)
    const { data: brief, error } = await auth.supabase.from('project_briefs').insert({
      project_id: projectId,
      ...fields,
      ...review,
      updated_at: now,
    }).select(PROJECT_BRIEF_COLUMNS).maybeSingle()
    if (error) {
      // A brief created between the read and the insert means this write is
      // stale, not a service failure.
      if ((error as { code?: string }).code === '23505') throw new ApiError(409, STALE_MESSAGE)
      throw new ApiError(503, 'Service temporarily unavailable')
    }
    if (!brief) throw new ApiError(503, 'Service temporarily unavailable')
    return NextResponse.json({ brief })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
