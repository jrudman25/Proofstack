'use client'

import { useState } from 'react'
import { BookOpen, ExternalLink, RefreshCw } from 'lucide-react'
import type { PortfolioBriefing } from '@/types'
import { Button } from '@/components/ui/button'
import { clientErrorMessage } from '@/lib/client-error-message'

export default function PortfolioBriefingPanel({ projectCount }: { projectCount?: number }) {
  const [briefing, setBriefing] = useState<PortfolioBriefing | null>(null)
  const [isLoading, setIsLoading] = useState(false)
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
    } catch {
      setMessage('Unable to generate your briefing. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const citation = (projectId: string) => briefing?.citations.find(item => item.projectId === projectId)

  return (
    <section aria-labelledby="briefing-heading" className="corner-ticks relative mt-6 border border-line bg-surface">
      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="briefing-heading" className="text-xl font-semibold tracking-tight">Interview briefing</h2>
          <p className="mt-1 text-sm leading-relaxed text-dim">
            {hasProjects
              ? 'Themes, spotlights, and practice questions drawn from your synced repositories and project briefs.'
              : 'Sync GitHub first. The briefing is built from your synced repositories and project briefs.'}
          </p>
        </div>
        <Button onClick={generate} disabled={isLoading || !hasProjects} className="eyebrow shrink-0">
          {isLoading ? <RefreshCw className="animate-spin" /> : <BookOpen />}
          {briefing ? 'Regenerate briefing' : 'Prepare briefing'}
        </Button>
      </div>

      {message && <p role="status" className="border-t border-line px-6 py-4 font-mono text-[11px] text-dim">{message}</p>}

      {briefing && (
        <div className="border-t border-line">
          <div className="px-6 py-6">
            <p className="max-w-4xl text-base leading-7 text-foreground">{briefing.summary}</p>
          </div>

          <div className="grid border-t border-line lg:grid-cols-2">
            <div className="space-y-5 border-b border-line p-6 lg:border-b-0 lg:border-r">
              <h3 className="label text-faint">Recurring themes</h3>
              {briefing.themes.map(theme => (
                <article key={theme.title} className="border-l border-brand-dim pl-4">
                  <h4 className="font-semibold text-foreground">{theme.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-dim">{theme.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {theme.projectIds.map(id => citation(id)).filter(Boolean).map(item => item && (
                      <a key={item.projectId} href={item.url} target="_blank" rel="noreferrer" className="eyebrow text-brand hover:underline">
                        {item.name} <ExternalLink className="inline h-2.5 w-2.5" />
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="space-y-5 p-6">
              <h3 className="label text-faint">Project spotlights</h3>
              {briefing.spotlights.map(spotlight => {
                const source = citation(spotlight.projectId)
                return (
                  <article key={spotlight.projectId} className="border border-line bg-ink p-4">
                    {source && <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:text-brand">{source.name}</a>}
                    <p className="mt-1 text-sm leading-relaxed text-dim">{spotlight.reason}</p>
                    <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
                      {spotlight.talkingPoints.map(point => <li key={point} className="before:mr-2 before:text-brand before:content-['>']">{point}</li>)}
                    </ul>
                  </article>
                )
              })}
            </div>
          </div>

          <div className="grid border-t border-line md:grid-cols-3">
            <div className="border-b border-line p-6 md:border-b-0 md:border-r">
              <h3 className="label text-faint">Growth narrative</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">{briefing.growth}</p>
            </div>
            <div className="border-b border-line p-6 md:border-b-0 md:border-r">
              <h3 className="label text-faint">Evidence gaps</h3>
              <ul className="mt-3 space-y-2 text-sm text-dim">
                {briefing.evidenceGaps.map(gap => <li key={gap}>{gap}</li>)}
              </ul>
            </div>
            <div className="p-6">
              <h3 className="label text-faint">Practice questions</h3>
              <ol className="mt-3 space-y-2 text-sm text-foreground/90">
                {briefing.interviewQuestions.map((question, index) => <li key={question}><span className="mr-2 font-mono text-[10px] text-brand">{String(index + 1).padStart(2, '0')}</span>{question}</li>)}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
