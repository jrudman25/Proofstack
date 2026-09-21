import type { ProjectLifecycleStatus } from '@/types'

// Columns read by both the chat and briefing evidence pipelines. Private
// repositories stay in the owner's workspace catalog but are never placed in
// an AI payload until the owner opts that project in (ai_opt_in).
export const EVIDENCE_PROJECT_FIELDS = 'id, name, full_name, description, html_url, language, technologies, stargazers_count, pushed_at, github_created_at, is_private, ai_opt_in, github_fork, github_owner_login, github_owner_type'
export const EVIDENCE_BRIEF_FIELDS = 'project_id, lifecycle_status, purpose, inspiration, role_and_contributions, architecture_and_decisions, challenges_and_solutions, outcomes_and_impact, lessons_learned, interview_talking_points, owner_verified_at'

export type EvidenceProjectRow = {
  id: string
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  technologies: string[] | null
  stargazers_count: number
  pushed_at: string | null
  github_created_at: string | null
  is_private: boolean
  ai_opt_in: boolean
  github_fork: boolean
  github_owner_login: string | null
  github_owner_type: 'User' | 'Organization' | null
}

export type EvidenceBriefRow = {
  project_id: string
  lifecycle_status: ProjectLifecycleStatus | null
  purpose: string | null
  inspiration: string | null
  role_and_contributions: string | null
  architecture_and_decisions: string | null
  challenges_and_solutions: string | null
  outcomes_and_impact: string | null
  lessons_learned: string | null
  interview_talking_points: string | null
  owner_verified_at: string | null
}

// 'indexed' means README evidence is embedded for retrieval, 'stale' means an
// embedding exists but predates the latest pushed_at, and 'metadata-only'
// means only GitHub catalog fields are available.
export type EvidenceStatus = 'indexed' | 'stale' | 'metadata-only'

export function aiEligible(project: Pick<EvidenceProjectRow, 'is_private' | 'ai_opt_in'>) {
  return !project.is_private || project.ai_opt_in
}

export function truncateText(value: string | null, length: number) {
  return value === null ? null : Array.from(value).slice(0, length).join('')
}

// True when the brief carries at least one owner-authored narrative field, so
// provenance labels reflect actual sources rather than the existence of a row.
export function briefHasOwnerContent(brief: EvidenceBriefRow | null | undefined) {
  if (!brief) return false
  return [
    brief.purpose, brief.inspiration, brief.role_and_contributions, brief.architecture_and_decisions,
    brief.challenges_and_solutions, brief.outcomes_and_impact, brief.lessons_learned, brief.interview_talking_points,
  ].some(value => typeof value === 'string' && value.trim().length > 0)
}

function ownerContext(brief: EvidenceBriefRow) {
  return {
    lifecycleStatus: brief.lifecycle_status,
    purpose: truncateText(brief.purpose, 2000),
    inspiration: truncateText(brief.inspiration, 2000),
    roleAndContributions: truncateText(brief.role_and_contributions, 2000),
    architectureAndDecisions: truncateText(brief.architecture_and_decisions, 2000),
    challengesAndSolutions: truncateText(brief.challenges_and_solutions, 2000),
    outcomesAndImpact: truncateText(brief.outcomes_and_impact, 2000),
    lessonsLearned: truncateText(brief.lessons_learned, 2000),
    interviewTalkingPoints: truncateText(brief.interview_talking_points, 2000),
    ownerVerified: Boolean(brief.owner_verified_at),
  }
}

export function toEvidenceEntry(project: EvidenceProjectRow, brief: EvidenceBriefRow | null | undefined, status: EvidenceStatus) {
  return {
    projectId: project.id,
    github: {
      name: project.name,
      fullName: project.full_name,
      description: truncateText(project.description, 500),
      primaryLanguage: project.language,
      technologies: (project.technologies || []).slice(0, 25).map(technology => truncateText(technology, 100)),
      stars: project.stargazers_count,
      lastPushedAt: project.pushed_at,
      createdAt: project.github_created_at,
      // GitHub-derived relationship, kept separate from the owner's stated
      // role so the model never infers sole authorship from access.
      repository: {
        fork: project.github_fork,
        ownerLogin: project.github_owner_login,
        ownerType: project.github_owner_type,
      },
    },
    ownerContext: brief ? ownerContext(brief) : null,
    evidenceStatus: status,
  }
}

export function evidenceStatus(indexedAtPushedAt: string | null | undefined, currentPushedAt: string | null): EvidenceStatus {
  if (!indexedAtPushedAt) return 'metadata-only'
  return indexedAtPushedAt === currentPushedAt ? 'indexed' : 'stale'
}
