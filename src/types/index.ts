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
  summary: string | null
  technologies: string[]
  has_code_map: boolean
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
  owner_verified_at: string | null
  last_reviewed_at: string | null
  ai_draft: Record<string, unknown>
  ai_draft_generated_at: string | null
  created_at: string
  updated_at: string
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

export type Todo = {
  id: string
  project_id: string
  task: string
  is_completed: boolean
  created_at: string
}

export type Milestone = {
  id: string
  project_id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
}
