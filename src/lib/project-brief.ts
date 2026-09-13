import { ApiError, objectBody } from './api-validation'
import type { ProjectBrief, ProjectLifecycleStatus } from '@/types'

export const PROJECT_BRIEF_COLUMNS = 'project_id, visibility, lifecycle_status, purpose, inspiration, role_and_contributions, architecture_and_decisions, challenges_and_solutions, outcomes_and_impact, lessons_learned, interview_talking_points, owner_verified_at, last_reviewed_at, ai_draft, ai_draft_generated_at, created_at, updated_at'

const TEXT_FIELDS = [
  'purpose',
  'inspiration',
  'role_and_contributions',
  'architecture_and_decisions',
  'challenges_and_solutions',
  'outcomes_and_impact',
  'lessons_learned',
  'interview_talking_points',
] as const

const LIFECYCLE_STATUSES = new Set<ProjectLifecycleStatus>(['prototype', 'active', 'maintained', 'completed', 'archived'])
const ALLOWED_FIELDS = new Set<string>(['visibility', 'lifecycleStatus', 'ownerVerified', ...TEXT_FIELDS])

export type ProjectBriefUpdate = Pick<ProjectBrief,
  | 'visibility'
  | 'lifecycle_status'
  | 'purpose'
  | 'inspiration'
  | 'role_and_contributions'
  | 'architecture_and_decisions'
  | 'challenges_and_solutions'
  | 'outcomes_and_impact'
  | 'lessons_learned'
  | 'interview_talking_points'
> & { ownerVerified: boolean }

export function parseProjectBriefBody(value: unknown): ProjectBriefUpdate {
  const body = objectBody(value)
  if (Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) throw new ApiError(400, 'Invalid project brief')
  if (body.visibility !== 'private' && body.visibility !== 'public') throw new ApiError(400, 'Invalid project brief')
  if (body.lifecycleStatus !== null && !LIFECYCLE_STATUSES.has(body.lifecycleStatus as ProjectLifecycleStatus)) {
    throw new ApiError(400, 'Invalid project brief')
  }
  if (typeof body.ownerVerified !== 'boolean') throw new ApiError(400, 'Invalid project brief')

  let total = 0
  const text = Object.fromEntries(TEXT_FIELDS.map(field => {
    const value = body[field]
    if (typeof value !== 'string' || value.length > 4000) throw new ApiError(400, 'Invalid project brief')
    total += value.length
    return [field, value.trim() || null]
  })) as Record<(typeof TEXT_FIELDS)[number], string | null>
  if (total > 20000) throw new ApiError(400, 'Project brief too large')

  return {
    visibility: body.visibility,
    lifecycle_status: body.lifecycleStatus as ProjectLifecycleStatus | null,
    ownerVerified: body.ownerVerified,
    purpose: text.purpose,
    inspiration: text.inspiration,
    role_and_contributions: text.role_and_contributions,
    architecture_and_decisions: text.architecture_and_decisions,
    challenges_and_solutions: text.challenges_and_solutions,
    outcomes_and_impact: text.outcomes_and_impact,
    lessons_learned: text.lessons_learned,
    interview_talking_points: text.interview_talking_points,
  }
}
