import { ApiError, objectBody } from './api-validation'
import type { ProjectBrief, ProjectLifecycleStatus, PublishableBriefField } from '@/types'

export const PROJECT_BRIEF_COLUMNS = 'project_id, visibility, lifecycle_status, purpose, inspiration, role_and_contributions, architecture_and_decisions, challenges_and_solutions, outcomes_and_impact, lessons_learned, interview_talking_points, published_fields, owner_verified_at, last_reviewed_at, ai_draft, ai_draft_generated_at, created_at, updated_at'

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

// The fields an owner may publish on a public profile. interview_talking_points
// is private interview preparation and is deliberately excluded; the database
// check constraint on project_briefs.published_fields mirrors this list.
export const PUBLISHABLE_BRIEF_FIELDS = [
  'lifecycle_status', 'purpose', 'inspiration', 'role_and_contributions',
  'architecture_and_decisions', 'challenges_and_solutions', 'outcomes_and_impact', 'lessons_learned',
] as const satisfies readonly PublishableBriefField[]

const PUBLISHABLE_SET = new Set<string>(PUBLISHABLE_BRIEF_FIELDS)
const LIFECYCLE_STATUSES = new Set<ProjectLifecycleStatus>(['prototype', 'active', 'maintained', 'completed', 'archived'])
const ALLOWED_FIELDS = new Set<string>(['visibility', 'lifecycleStatus', 'ownerVerified', 'baseUpdatedAt', 'publishedFields', ...TEXT_FIELDS])

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
> & { ownerVerified: boolean; baseUpdatedAt: string | null; published_fields?: PublishableBriefField[] }

export function parseProjectBriefBody(value: unknown): ProjectBriefUpdate {
  const body = objectBody(value)
  if (Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) throw new ApiError(400, 'Invalid project brief')
  if (body.visibility !== 'private' && body.visibility !== 'public') throw new ApiError(400, 'Invalid project brief')
  if (body.lifecycleStatus !== null && !LIFECYCLE_STATUSES.has(body.lifecycleStatus as ProjectLifecycleStatus)) {
    throw new ApiError(400, 'Invalid project brief')
  }
  if (typeof body.ownerVerified !== 'boolean') throw new ApiError(400, 'Invalid project brief')
  // publishedFields is optional: an omitted key preserves the stored selection
  // so older editors never wipe the owner's publication choices on save.
  if (body.publishedFields !== undefined
    && (!Array.isArray(body.publishedFields) || body.publishedFields.length > PUBLISHABLE_BRIEF_FIELDS.length
      || new Set(body.publishedFields).size !== body.publishedFields.length
      || body.publishedFields.some(field => typeof field !== 'string' || !PUBLISHABLE_SET.has(field)))) {
    throw new ApiError(400, 'Invalid project brief')
  }
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
    ...(body.publishedFields === undefined ? {} : { published_fields: body.publishedFields as PublishableBriefField[] }),
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
