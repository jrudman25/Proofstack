import { NextResponse } from 'next/server'
import { authenticateUser, requireProject } from '@/lib/api-auth'
import { apiErrorResponse, ApiError, parseProjectId, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { parseProjectBriefBody, PROJECT_BRIEF_COLUMNS } from '@/lib/project-brief'

type RouteContext = { params: Promise<{ id: string }> }

async function projectIdFrom(context: RouteContext) {
  return parseProjectId((await context.params).id)
}

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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateUser()
    const projectId = await projectIdFrom(context)
    const { ownerVerified, ...fields } = parseProjectBriefBody(await readJsonBody(request, 32768))
    await enforceRateLimit(auth, 'project-brief')
    await requireProject(auth, projectId)

    const now = new Date().toISOString()
    const review = ownerVerified ? { owner_verified_at: now, last_reviewed_at: now } : { owner_verified_at: null }
    const { data: brief, error } = await auth.supabase.from('project_briefs').upsert({
      project_id: projectId,
      ...fields,
      ...review,
      updated_at: now,
    }, { onConflict: 'project_id' }).select(PROJECT_BRIEF_COLUMNS).maybeSingle()
    if (error || !brief) throw new ApiError(503, 'Service temporarily unavailable')
    return NextResponse.json({ brief })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
