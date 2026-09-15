import type { PortfolioBriefing } from '@/types'

export const PORTFOLIO_BRIEFING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'themes', 'spotlights', 'growth', 'evidenceGaps', 'interviewQuestions'],
  properties: {
    summary: { type: 'string' },
    themes: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['title', 'detail', 'projectIds'], properties: {
      title: { type: 'string' }, detail: { type: 'string' }, projectIds: { type: 'array', maxItems: 8, items: { type: 'string' } },
    } } },
    spotlights: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['projectId', 'reason', 'talkingPoints'], properties: {
      projectId: { type: 'string' }, reason: { type: 'string' }, talkingPoints: { type: 'array', maxItems: 6, items: { type: 'string' } },
    } } },
    growth: { type: 'string' },
    evidenceGaps: { type: 'array', maxItems: 8, items: { type: 'string' } },
    interviewQuestions: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
} as const

type CitationProject = { id: string; name: string; html_url: string; hasOwnerContext: boolean }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid briefing')
  return value as Record<string, unknown>
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid briefing')
  return value.trim()
}

function texts(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error('Invalid briefing')
  return value.map(item => text(item, maxLength))
}

// Counts repositories added, removed, or pushed since the persisted briefing
// was generated, by comparing its stored evidence snapshot against the
// current catalog.
export function briefingChangedCount(evidence: unknown, projects: { id: string; pushed_at: string | null }[]): number {
  const snapshot = evidence && typeof evidence === 'object' && !Array.isArray(evidence)
    ? (evidence as { projects?: unknown }).projects : undefined
  if (!Array.isArray(snapshot)) return 0
  const previous = new Map<string, string | null>()
  for (const entry of snapshot) {
    if (entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') {
      previous.set((entry as { id: string }).id, (entry as { pushed_at?: string | null }).pushed_at ?? null)
    }
  }
  let changed = 0
  const currentIds = new Set(projects.map(project => project.id))
  for (const project of projects) {
    if (!previous.has(project.id) || previous.get(project.id) !== project.pushed_at) changed++
  }
  for (const id of previous.keys()) {
    if (!currentIds.has(id)) changed++
  }
  return changed
}

export function parseGeneratedBriefing(value: string, projects: CitationProject[]): PortfolioBriefing {
  const root = object(JSON.parse(value))
  const allowedIds = new Set(projects.map(project => project.id))
  const themes = Array.isArray(root.themes) && root.themes.length <= 6 ? root.themes.map(value => {
    const theme = object(value)
    const projectIds = texts(theme.projectIds, 8, 100)
    if (projectIds.some(id => !allowedIds.has(id))) throw new Error('Invalid briefing')
    return { title: text(theme.title, 120), detail: text(theme.detail, 1000), projectIds }
  }) : (() => { throw new Error('Invalid briefing') })()
  const spotlights = Array.isArray(root.spotlights) && root.spotlights.length <= 6 ? root.spotlights.map(value => {
    const spotlight = object(value)
    const projectId = text(spotlight.projectId, 100)
    if (!allowedIds.has(projectId)) throw new Error('Invalid briefing')
    return { projectId, reason: text(spotlight.reason, 1000), talkingPoints: texts(spotlight.talkingPoints, 6, 500) }
  }) : (() => { throw new Error('Invalid briefing') })()
  const referenced = new Set([...themes.flatMap(theme => theme.projectIds), ...spotlights.map(spotlight => spotlight.projectId)])
  const citations = projects.filter(project => referenced.has(project.id)).map(project => ({
    projectId: project.id,
    name: project.name,
    url: project.html_url,
    evidence: (project.hasOwnerContext ? ['github', 'owner'] : ['github']) as ('github' | 'owner')[],
  }))
  return {
    summary: text(root.summary, 2000),
    themes,
    spotlights,
    growth: text(root.growth, 1500),
    evidenceGaps: texts(root.evidenceGaps, 8, 500),
    interviewQuestions: texts(root.interviewQuestions, 8, 500),
    citations,
  }
}
