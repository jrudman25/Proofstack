export type Project = {
  id: string
  user_id: string
  github_repo_id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  homepage: string | null
  stargazers_count: number
  pushed_at: string | null
  github_created_at: string | null
  is_private: boolean
  ai_opt_in: boolean
  github_fork: boolean
  github_owner_login: string | null
  github_owner_type: 'User' | 'Organization' | null
  technologies: string[]
  has_code_map: boolean
  github_deleted_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectLifecycleStatus = 'prototype' | 'active' | 'maintained' | 'completed' | 'archived'

export type ProjectBrief = {
  project_id: string
  visibility: 'private' | 'public'
  lifecycle_status: ProjectLifecycleStatus | null
  purpose: string | null
  inspiration: string | null
  role_and_contributions: string | null
  architecture_and_decisions: string | null
  challenges_and_solutions: string | null
  outcomes_and_impact: string | null
  lessons_learned: string | null
  interview_talking_points: string | null
  published_fields: PublishableBriefField[]
  owner_verified_at: string | null
  last_reviewed_at: string | null
  ai_draft: Record<string, unknown>
  ai_draft_generated_at: string | null
  created_at: string
  updated_at: string
}

// The subset of owner-authored brief fields surfaced on dashboard cards.
export type ProjectBriefSummary = Pick<ProjectBrief, 'purpose' | 'lifecycle_status' | 'owner_verified_at'>

// The dashboard needs no user_id, github_repo_id, has_code_map, or
// github_deleted_at columns (tombstoned rows are filtered out before they
// reach the page); cards additionally carry the owner brief when one exists.
export type DashboardProject = Omit<Project, 'user_id' | 'github_repo_id' | 'has_code_map' | 'github_deleted_at'> & {
  brief: ProjectBriefSummary | null
}

export type PortfolioBriefing = {
  summary: string
  themes: { title: string; detail: string; projectIds: string[] }[]
  spotlights: { projectId: string; reason: string; talkingPoints: string[] }[]
  growth: string
  evidenceGaps: string[]
  interviewQuestions: string[]
  citations: { projectId: string; name: string; url: string; evidence: ('github' | 'owner')[] }[]
}

// A briefing persisted server-side together with the time it was generated
// and how many synced repositories changed since that generation.
export type StoredBriefing = {
  briefing: PortfolioBriefing
  generatedAt: string
  changedCount: number
}

// The brief fields an owner may publish. interview_talking_points is private
// interview preparation and is deliberately absent.
export type PublishableBriefField = 'lifecycle_status' | 'purpose' | 'inspiration'
  | 'role_and_contributions' | 'architecture_and_decisions' | 'challenges_and_solutions'
  | 'outcomes_and_impact' | 'lessons_learned'

// The public-safe projection of a stored portfolio briefing, snapshotted at
// publish time. evidenceGaps and interviewQuestions are owner-preparation
// sections and are never copied here.
export type PublicBriefingSnapshot = {
  summary: string
  themes: { title: string; detail: string; projectIds: string[] }[]
  spotlights: { projectId: string; reason: string; talkingPoints: string[] }[]
  growth: string
  citations: { projectId: string; name: string; url: string; evidence: ('github' | 'owner')[] }[]
}

// What the public profile actually returns. Brief fields absent from
// published_fields are omitted entirely; internal ids, embeddings, AI drafts,
// and private-repository evidence never leave this boundary.
export type PublicProfile = {
  slug: string
  githubUsername: string
  avatarUrl: string | null
  fullName: string | null
  publishedAt: string | null
  briefing: {
    summary: string
    themes: { title: string; detail: string; projects: { name: string; url: string }[] }[]
    spotlights: { project: { name: string; url: string }; reason: string; talkingPoints: string[] }[]
    growth: string
    citations: { name: string; url: string; evidence: ('github' | 'owner')[] }[]
    publishedAt: string | null
  } | null
  projects: {
    name: string
    fullName: string
    description: string | null
    url: string
    homepage: string | null
    language: string | null
    technologies: string[]
    stargazersCount: number
    pushedAt: string | null
    githubCreatedAt: string | null
    repository: { fork: boolean; ownerLogin: string | null; ownerType: 'User' | 'Organization' | null }
    ownerReviewed: boolean
    brief: Partial<Record<PublishableBriefField, string | null>>
  }[]
}

// Automated, temporary analysis of a GitHub user who has not claimed a
// Proofstack profile. Stored only in a bounded cache and always rendered
// with an unclaimed/automated label, separate from owner-verified content.
export type UnclaimedAnalysis = {
  username: string
  summary: string
  focusAreas: string[]
  notableProjects: { name: string; url: string; reason: string }[]
  generatedAt: string
}
