import { ApiError, objectBody } from './api-validation'
import type { ProjectBrief, ProjectLifecycleStatus } from '@/types'

export const PROJECT_BRIEF_COLUMNS = 'project_id, visibility, lifecycle_status, purpose, inspiration, role_and_contributions, architecture_and_decisions, challenges_and_solutions, outcomes_and_impact, lessons_learned, interview_talking_points, owner_verified_at, last_reviewed_at, ai_draft, ai_draft_generated_at, created_at, updated_at'

// Shared limits so the editor can enforce the same boundaries the API
// validates: per-field and total character caps plus the serialized body cap
// enforced by readJsonBody.
export const BRIEF_FIELD_LIMIT = 4000
export const BRIEF_TOTAL_LIMIT = 20000
export const BRIEF_BODY_BYTES = 32768

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
const ALLOWED_FIELDS = new Set<string>(['visibility', 'lifecycleStatus', 'ownerVerified', 'baseUpdatedAt', ...TEXT_FIELDS])

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
> & { ownerVerified: boolean; baseUpdatedAt: string | null }

export function parseProjectBriefBody(value: unknown): ProjectBriefUpdate {
  const body = objectBody(value)
  if (Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) throw new ApiError(400, 'Invalid project brief')
  if (body.visibility !== 'private' && body.visibility !== 'public') throw new ApiError(400, 'Invalid project brief')
  if (body.lifecycleStatus !== null && !LIFECYCLE_STATUSES.has(body.lifecycleStatus as ProjectLifecycleStatus)) {
    throw new ApiError(400, 'Invalid project brief')
  }
  if (typeof body.ownerVerified !== 'boolean') throw new ApiError(400, 'Invalid project brief')
  // baseUpdatedAt is the optimistic-concurrency precondition: the client sends
  // the updated_at of the brief it edited, or null when no brief exists yet.
  if (body.baseUpdatedAt !== undefined && body.baseUpdatedAt !== null
    && (typeof body.baseUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.baseUpdatedAt)))) {
    throw new ApiError(400, 'Invalid project brief')
  }

  let total = 0
  const text = Object.fromEntries(TEXT_FIELDS.map(field => {
    const value = body[field]
    if (typeof value !== 'string' || value.length > BRIEF_FIELD_LIMIT) throw new ApiError(400, 'Invalid project brief')
    total += value.length
    return [field, value.trim() || null]
  })) as Record<(typeof TEXT_FIELDS)[number], string | null>
  if (total > BRIEF_TOTAL_LIMIT) throw new ApiError(400, 'Project brief too large')

  return {
    visibility: body.visibility,
    lifecycle_status: body.lifecycleStatus as ProjectLifecycleStatus | null,
    ownerVerified: body.ownerVerified,
    baseUpdatedAt: (body.baseUpdatedAt as string | null | undefined) ?? null,
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
