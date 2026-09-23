import { ApiError } from './api-validation'
import { PUBLIC_SLUG_PATTERN } from './profile-slug-patterns'
import { PUBLISHABLE_BRIEF_FIELDS } from './project-brief'
import { createAdminClient } from '@/utils/supabase/admin'
import type { PortfolioBriefing, PublicBriefingSnapshot, PublicProfile, PublishableBriefField } from '@/types'

// Server-only public retrieval boundary. This module uses the service-role
// client, which bypasses RLS, so every filter and field projection here is
// the actual publication policy: only published profiles, only public
// repositories the owner selected, and only the brief fields the owner
// published. Nothing else may leave this function.
//
// Private repositories are excluded unconditionally: publishing a sanitized
// description of private work requires an explicit owner-review flow that
// does not exist yet, so is_private rows never enter a public response even
// when their brief is marked public.

export { PUBLIC_SLUG_PATTERN }

// Note: interview_talking_points is intentionally absent from both lists; it
// is private interview preparation and is never publishable or selectable.
const PUBLIC_PROJECT_FIELDS = 'id, name, full_name, description, html_url, homepage, language, technologies, stargazers_count, pushed_at, github_created_at, is_private, github_fork, github_owner_login, github_owner_type, github_deleted_at'
const PUBLIC_BRIEF_FIELDS = 'visibility, published_fields, lifecycle_status, purpose, inspiration, role_and_contributions, architecture_and_decisions, challenges_and_solutions, outcomes_and_impact, lessons_learned, owner_verified_at'

const PUBLISHABLE_SET: ReadonlySet<string> = new Set<string>(PUBLISHABLE_BRIEF_FIELDS)

const PROJECT_LIMIT = 200
const PUBLISHED_SLUG_LIMIT = 49_999

type PublicProjectRow = {
  id: string
  name: string
  full_name: string
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  technologies: string[] | null
  stargazers_count: number
  pushed_at: string | null
  github_created_at: string | null
  is_private: boolean
  github_fork: boolean
  github_owner_login: string | null
  github_owner_type: 'User' | 'Organization' | null
  github_deleted_at: string | null
  // PostgREST returns this to-one embed as an object; typed as a union so the
  // array-normalizing guard stays honest.
  project_briefs: BriefRow | BriefRow[] | null
}

type BriefRow = {
  visibility: string
  published_fields: string[] | null
  lifecycle_status: string | null
  purpose: string | null
  inspiration: string | null
  role_and_contributions: string | null
  architecture_and_decisions: string | null
  challenges_and_solutions: string | null
  outcomes_and_impact: string | null
  lessons_learned: string | null
  owner_verified_at: string | null
}

// The public-safe projection written to profiles.public_briefing at publish
// time. Only owner-facing sections are dropped; stored project ids are
// resolved against published projects at read time.
export function buildPublicBriefingSnapshot(briefing: PortfolioBriefing): PublicBriefingSnapshot {
  return {
    summary: briefing.summary,
    themes: briefing.themes.map(theme => ({ title: theme.title, detail: theme.detail, projectIds: [...theme.projectIds] })),
    spotlights: briefing.spotlights.map(spotlight => ({
      projectId: spotlight.projectId, reason: spotlight.reason, talkingPoints: [...spotlight.talkingPoints],
    })),
    growth: briefing.growth,
    citations: briefing.citations.map(citation => ({ ...citation, evidence: [...citation.evidence] })),
  }
}

function parseSnapshot(value: unknown): PublicBriefingSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const sections = (list: unknown, check: (item: Record<string, unknown>) => boolean) =>
    Array.isArray(list) && list.every(item => item && typeof item === 'object' && !Array.isArray(item) && check(item as Record<string, unknown>))
  if (typeof v.summary !== 'string' || typeof v.growth !== 'string'
    || !sections(v.themes, t => typeof t.title === 'string' && typeof t.detail === 'string' && Array.isArray(t.projectIds))
    || !sections(v.spotlights, s => typeof s.projectId === 'string' && typeof s.reason === 'string' && Array.isArray(s.talkingPoints))
    || !sections(v.citations, c => typeof c.projectId === 'string' && typeof c.name === 'string' && typeof c.url === 'string' && Array.isArray(c.evidence))) {
    return null
  }
  return v as unknown as PublicBriefingSnapshot
}

export async function getPublishedProfileSlugs(): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles')
    .select('public_slug')
    .eq('profile_published', true)
    .not('public_slug', 'is', null)
    .order('public_slug', { ascending: true })
    .limit(PUBLISHED_SLUG_LIMIT)
  if (error) throw new ApiError(503, 'Service temporarily unavailable')
  return ((data || []) as { public_slug: string | null }[])
    .map(row => row.public_slug)
    .filter((slug): slug is string => typeof slug === 'string' && PUBLIC_SLUG_PATTERN.test(slug))
}

export async function getPublicProfile(slug: string): Promise<PublicProfile | null> {
  const normalized = slug.toLowerCase()
  if (!PUBLIC_SLUG_PATTERN.test(normalized)) return null
  const admin = createAdminClient()

  const { data: profile, error } = await admin.from('profiles')
    .select('id, github_username, avatar_url, full_name, public_slug, profile_published_at, public_briefing, public_briefing_published_at')
    .eq('public_slug', normalized)
    .eq('profile_published', true)
    .maybeSingle()
  if (error) throw new ApiError(503, 'Service temporarily unavailable')
  if (!profile) return null

  const { data: rows, error: projectError } = await admin.from('projects')
    .select(`${PUBLIC_PROJECT_FIELDS}, project_briefs!inner(${PUBLIC_BRIEF_FIELDS})`)
    .eq('user_id', profile.id)
    .eq('is_private', false)
    .is('github_deleted_at', null)
    .eq('project_briefs.visibility', 'public')
    .order('pushed_at', { ascending: false })
    .limit(PROJECT_LIMIT)
  if (projectError) throw new ApiError(503, 'Service temporarily unavailable')

  // The query filters on is_private and visibility already; this guard keeps a
  // private or unselected row from ever leaving this boundary even if the
  // filter semantics were misread or changed. PostgREST returns the to-one
  // brief embed as an object; the array branch is belt-and-suspenders.
  const visible = ((rows || []) as unknown as PublicProjectRow[])
    .map(row => ({ ...row, project_briefs: Array.isArray(row.project_briefs) ? row.project_briefs[0] ?? null : row.project_briefs }))
    .filter(row => row.is_private === false && row.github_deleted_at === null && row.project_briefs?.visibility === 'public')
  const projects = visible.map(row => {
    const brief = row.project_briefs
    const fields: Partial<Record<PublishableBriefField, string | null>> = {}
    // Defense in depth: even if a non-publishable field name were ever
    // persisted in published_fields, only allowlisted fields are copied out.
    for (const field of brief?.published_fields || []) {
      if (PUBLISHABLE_SET.has(field as PublishableBriefField)) {
        fields[field as PublishableBriefField] = brief?.[field as PublishableBriefField] ?? null
      }
    }
    return {
      name: row.name,
      fullName: row.full_name,
      description: row.description,
      url: row.html_url,
      homepage: row.homepage,
      language: row.language,
      technologies: row.technologies || [],
      stargazersCount: row.stargazers_count,
      pushedAt: row.pushed_at,
      githubCreatedAt: row.github_created_at,
      repository: { fork: row.github_fork, ownerLogin: row.github_owner_login, ownerType: row.github_owner_type },
      ownerReviewed: Boolean(brief?.owner_verified_at),
      brief: fields,
    }
  })

  const publishedProjects = new Map(visible.map((row, index) => [
    row.id, { name: projects[index].name, url: projects[index].url },
  ]))
  const snapshot = parseSnapshot(profile.public_briefing)
  const briefing = snapshot && {
    summary: snapshot.summary,
    themes: snapshot.themes
      .map(theme => ({
        title: theme.title,
        detail: theme.detail,
        projects: theme.projectIds.filter(id => publishedProjects.has(id)).map(id => publishedProjects.get(id)!),
      }))
      .filter(theme => theme.projects.length > 0),
    spotlights: snapshot.spotlights
      .filter(spotlight => publishedProjects.has(spotlight.projectId))
      .map(spotlight => ({
        project: publishedProjects.get(spotlight.projectId)!,
        reason: spotlight.reason,
        talkingPoints: spotlight.talkingPoints,
      })),
    growth: snapshot.growth,
    citations: snapshot.citations
      .filter(citation => publishedProjects.has(citation.projectId))
      .map(citation => ({ ...publishedProjects.get(citation.projectId)!, evidence: citation.evidence })),
    publishedAt: profile.public_briefing_published_at,
  }

  return {
    slug: profile.public_slug,
    githubUsername: profile.github_username,
    avatarUrl: profile.avatar_url,
    fullName: profile.full_name,
    publishedAt: profile.profile_published_at,
    briefing,
    projects,
  }
}
