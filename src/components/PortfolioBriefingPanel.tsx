'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, ChevronDown, ExternalLink, RefreshCw } from 'lucide-react'
import type { PortfolioBriefing, StoredBriefing } from '@/types'
import { Button } from '@/components/ui/button'
import { clientErrorMessage } from '@/lib/client-error-message'

const isoDate = (value: string | null | undefined) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const EVIDENCE_LABELS = { github: 'GitHub metadata', owner: 'Owner notes' } as const

function ProjectLink({ projectId, name, url }: { projectId: string; name: string; url: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Link href={`/project/${projectId}`} className="eyebrow text-brand hover:underline">
        {name}
      </Link>
      <a href={url} target="_blank" rel="noreferrer" aria-label={`View ${name} on GitHub (opens in new tab)`} className="text-dim hover:text-foreground">
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </span>
  )
}

export default function PortfolioBriefingPanel({ projectCount, initial }: { projectCount?: number; initial?: StoredBriefing | null }) {
  const [briefing, setBriefing] = useState<PortfolioBriefing | null>(initial?.briefing ?? null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(initial?.generatedAt ?? null)
  const [changedCount, setChangedCount] = useState(initial?.changedCount ?? 0)
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const hasProjects = projectCount === undefined || projectCount > 0

  const generate = async () => {
    setIsLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/portfolio-briefing', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) {
        setMessage(clientErrorMessage(response, result, 'Unable to generate your briefing. Please try again.'))
        return
      }
      if (!result.briefing) throw new Error('Briefing unavailable')
      setBriefing(result.briefing)
      setGeneratedAt(typeof result.generatedAt === 'string' ? result.generatedAt : new Date().toISOString())
      setChangedCount(0)
      setIsExpanded(true)
    } catch {
      setMessage('Unable to generate your briefing. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const citation = (projectId: string) => briefing?.citations.find(item => item.projectId === projectId)

  return (
    <section aria-labelledby="briefing-heading" className="corner-ticks relative mt-6 border border-line bg-surface">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="briefing-heading" className="text-base font-semibold tracking-tight">Interview briefing</h2>
            {generatedAt && (
              <p className="font-mono text-[10px] text-dim">
                AI-generated {isoDate(generatedAt)}
                {changedCount > 0 && <span className="text-amber-300/80"> · {changedCount} {changedCount === 1 ? 'repository' : 'repositories'} changed</span>}
              </p>
            )}
          </div>
          <p className="mt-1 text-sm text-dim">
            {hasProjects
              ? briefing ? 'Your evidence-backed interview overview is ready.' : 'Prepare themes, project spotlights, and practice questions.'
              : 'Sync GitHub first to prepare a briefing.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {briefing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={isExpanded}
              aria-controls="briefing-content"
              onClick={() => setIsExpanded(expanded => !expanded)}
              className="eyebrow"
            >
              {isExpanded ? 'Hide briefing' : 'Show briefing'}
              <ChevronDown className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </Button>
          )}
          <Button onClick={generate} disabled={isLoading || !hasProjects} size="sm" className="eyebrow">
            {isLoading ? <RefreshCw className="animate-spin" /> : <BookOpen />}
            {briefing ? 'Regenerate' : 'Prepare briefing'}
          </Button>
        </div>
      </div>

      {message && <p role="status" className="border-t border-line px-5 py-3 font-mono text-[11px] text-dim">{message}</p>}

      {briefing && isExpanded && (
        <div id="briefing-content" className="border-t border-line">
          <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
              <p className="eyebrow mb-2 text-dim">Overview</p>
              <p className="text-sm leading-6 text-foreground">{briefing.summary}</p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-dim">AI-generated. Verify claims against linked evidence before an interview.</p>
            </div>

            <div className="p-5">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="label text-dim">Project spotlights</h3>
                <a href="#projects" className="eyebrow text-dim transition-colors hover:text-brand">Browse all</a>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {briefing.spotlights.map(spotlight => {
                  const source = citation(spotlight.projectId)
                  return (
                    <article key={spotlight.projectId} className="border border-line bg-ink p-3">
                      {source && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <ProjectLink projectId={source.projectId} name={source.name} url={source.url} />
                          <span className="font-mono text-[10px] text-dim">
                            {source.evidence.map(kind => EVIDENCE_LABELS[kind]).join(' + ')}
                          </span>
                        </div>
                      )}
                      <p className="mt-1 text-sm leading-relaxed text-dim">{spotlight.reason}</p>
                      <ul className="mt-2 space-y-1 text-sm text-foreground/90">
                        {spotlight.talkingPoints.map(point => <li key={point} className="before:mr-2 before:text-brand before:content-['>']">{point}</li>)}
                      </ul>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>

          <details className="group border-t border-line">
            <summary className="label cursor-pointer select-none px-5 py-3 text-dim transition-colors hover:text-foreground">
              Supporting detail
              <span className="ml-3 font-normal normal-case tracking-normal text-dim">Themes, growth, evidence gaps, and practice questions</span>
            </summary>
            <div className="grid border-t border-line lg:grid-cols-2">
              <div className="space-y-4 border-b border-line p-5 lg:border-b-0 lg:border-r">
                <h3 className="label text-dim">Recurring themes</h3>
                {briefing.themes.map(theme => (
                  <article key={theme.title} className="border-l border-brand-dim pl-4">
                    <h4 className="font-semibold text-foreground">{theme.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-dim">{theme.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {theme.projectIds.map(id => citation(id)).filter(Boolean).map(item => item && (
                        <ProjectLink key={item.projectId} projectId={item.projectId} name={item.name} url={item.url} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className="grid content-start gap-0">
                <div className="border-b border-line p-5">
                  <h3 className="label text-dim">Growth narrative</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{briefing.growth}</p>
                </div>
                <div className="border-b border-line p-5">
                  <h3 className="label text-dim">Evidence gaps</h3>
                  <ul className="mt-2 space-y-2 text-sm text-dim">
                    {briefing.evidenceGaps.map(gap => <li key={gap}>{gap}</li>)}
                  </ul>
                </div>
                <div className="p-5">
                  <h3 className="label text-dim">Practice questions</h3>
                  <ol className="mt-2 space-y-2 text-sm text-foreground/90">
                    {briefing.interviewQuestions.map((question, index) => <li key={question}><span className="mr-2 font-mono text-[10px] text-brand">{String(index + 1).padStart(2, '0')}</span>{question}</li>)}
                  </ol>
                </div>
              </div>
            </div>
          </details>
        </div>
      )}
    </section>
  )
}
