'use client'

import { useState } from 'react'
import { Project, ProjectBrief } from '@/types'
import { ArrowLeft, Star, Lock, FileText } from 'lucide-react'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'
import { languageColor } from '@/lib/language-colors'
import { clientErrorMessage } from '@/lib/client-error-message'
import StatusMessage, { type StatusNotice } from '@/components/StatusMessage'
import Link from 'next/link'
import ProjectBriefEditor from '@/components/ProjectBriefEditor'
import ChatWidget from '@/components/ChatWidget'

export default function ProjectDetailClient({
  project,
  initialBrief,
  briefLoadFailed = false,
  readmeIndexExists = false,
  readmeIndexedPushedAt = null,
}: {
  project: Project,
  initialBrief?: ProjectBrief | null,
  briefLoadFailed?: boolean,
  readmeIndexExists?: boolean,
  readmeIndexedPushedAt?: string | null,
}) {
  const [aiOptIn, setAiOptIn] = useState(project.ai_opt_in)
  const [consentMessage, setConsentMessage] = useState<StatusNotice | null>(null)
  const [isConsentSaving, setIsConsentSaving] = useState(false)
  const [indexStatus, setIndexStatus] = useState<'idle' | 'working' | 'done' | 'failed'>(readmeIndexExists ? 'done' : 'idle')
  const [indexStale, setIndexStale] = useState(readmeIndexExists && readmeIndexedPushedAt !== project.pushed_at)
  const [indexMessage, setIndexMessage] = useState<StatusNotice | null>(null)
  const [briefDirty, setBriefDirty] = useState(false)

  const aiEnabled = !project.is_private || aiOptIn

  const confirmLeave = (event: React.MouseEvent) => {
    if (briefDirty && !window.confirm('You have unsaved brief changes. Leave without saving?')) {
      event.preventDefault()
    }
  }

  const handleConsent = async (next: boolean) => {
    setIsConsentSaving(true)
    setConsentMessage(null)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiOptIn: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setConsentMessage({ text: clientErrorMessage(res, data, 'Unable to update AI consent. Please try again.'), tone: 'error' })
        return
      }
      setAiOptIn(next)
      setConsentMessage({
        text: next
          ? 'AI processing enabled for this repository.'
          : 'AI processing disabled. Embedded README evidence was removed.',
        tone: 'info',
      })
    } catch {
      setConsentMessage({ text: 'Unable to update AI consent. Please try again.', tone: 'error' })
    } finally {
      setIsConsentSaving(false)
    }
  }

  const handleIndex = async () => {
    setIndexStatus('working')
    setIndexMessage(null)
    try {
      const res = await fetch(`/api/projects/${project.id}/index`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setIndexStatus('failed')
        setIndexMessage({ text: clientErrorMessage(res, data, 'Unable to index the README. Please try again.'), tone: 'error' })
        return
      }
      if (data.indexed) {
        setIndexStatus('done')
        setIndexStale(false)
        setIndexMessage({ text: 'README indexed for chat and briefings.', tone: 'info' })
      } else {
        setIndexStatus('failed')
        setIndexMessage({ text: 'No README found for this repository.', tone: 'error' })
      }
    } catch {
      setIndexStatus('failed')
      setIndexMessage({ text: 'Unable to index the README. Please try again.', tone: 'error' })
    }
  }

  const evidenceSummary = (
    indexStatus === 'done'
      ? indexStale ? 'README evidence indexed but stale' : 'README evidence indexed'
      : 'README evidence not indexed'
  ) + (project.is_private && !aiOptIn ? ' · AI processing off for this private repository' : '')

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-line bg-ink/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" onClick={confirmLeave} className="flex items-center gap-3" aria-label="Back to dashboard">
            <Logo className="h-5 w-5 text-brand" />
            <span className="label font-bold tracking-[0.3em]">Proofstack</span>
          </Link>
          <span className="truncate font-mono text-[11px] text-dim">{project.full_name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">

        <Link
          href="/"
          onClick={confirmLeave}
          className="label inline-flex items-center gap-2 text-dim transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>

        <header className="corner-ticks relative border border-line bg-surface px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
                {project.is_private && (
                  <span className="eyebrow flex items-center gap-1.5 border border-line px-2 py-1 text-dim">
                    <Lock className="h-3 w-3" /> Private
                  </span>
                )}
              </div>
              {project.description && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dim">{project.description}</p>
              )}
            </div>
            <a
              href={project.html_url}
              aria-label={`View ${project.name} on GitHub (opens in new tab)`}
              target="_blank"
              rel="noreferrer"
              className="eyebrow flex items-center gap-2 border border-line px-3 py-2 text-dim transition-colors hover:border-line-bright hover:text-foreground"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              Source
            </a>
          </div>

          <div className="eyebrow mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-dim">
            {project.language && (
              <span className="flex items-center gap-1.5 text-dim">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: languageColor(project.language) }} />
                {project.language}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Star className="h-3 w-3 text-amber-300/80" />
              {project.stargazers_count}
            </span>
            {(project.technologies || []).slice(0, 6).map(tech => (
              <span key={tech} style={{ color: languageColor(tech) }}>{tech}</span>
            ))}
          </div>
        </header>

        {briefLoadFailed ? (
          <section aria-labelledby="brief-heading" className="corner-ticks relative border border-line bg-surface px-6 py-5">
            <h2 id="brief-heading" className="text-xl font-semibold tracking-tight">Project brief</h2>
            <p className="mt-2 text-sm leading-relaxed text-dim">
              Your brief could not be read, so editing is disabled to protect your saved content. Reload the page to try again.
            </p>
          </section>
        ) : (
          <ProjectBriefEditor projectId={project.id} initialBrief={initialBrief} onDirtyChange={setBriefDirty} />
        )}

        <details id="ai-evidence" className="border border-line bg-surface">
          <summary className="label cursor-pointer select-none px-6 py-4 text-dim transition-colors hover:text-foreground">
            AI evidence
            <span className="ml-3 font-normal normal-case tracking-normal">{evidenceSummary}</span>
          </summary>

          <div className="space-y-6 border-t border-line p-6">
            {project.is_private && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="label text-dim">Private repository</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">
                    Enabling AI processing sends this repository&apos;s metadata and README to Gemini for briefings, chat, and indexing. Raw private evidence never appears outside your workspace.
                  </p>
                  {consentMessage && <StatusMessage tone={consentMessage.tone} className="mt-2">{consentMessage.text}</StatusMessage>}
                </div>
                <Button
                  variant={aiOptIn ? 'outline' : 'default'}
                  disabled={isConsentSaving}
                  onClick={() => handleConsent(!aiOptIn)}
                  className="eyebrow shrink-0"
                >
                  {aiOptIn ? 'Disable AI processing' : 'Enable AI processing'}
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="label text-dim">README evidence</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">
                  {indexStatus === 'done'
                    ? indexStale
                      ? 'The README is indexed, but the repository has changed since. Reindex to refresh the evidence.'
                      : 'The README is indexed and available to chat and briefings.'
                    : 'Index the README so chat and briefings can cite its contents.'}
                </p>
                {indexMessage && <StatusMessage tone={indexMessage.tone} className="mt-2">{indexMessage.text}</StatusMessage>}
              </div>
              <Button
                variant="outline"
                disabled={indexStatus === 'working' || !aiEnabled}
                onClick={handleIndex}
                className="eyebrow shrink-0"
              >
                <FileText className="h-3.5 w-3.5" />
                {indexStatus === 'working' ? 'Indexing' : indexStatus === 'done' ? 'Reindex README' : 'Index README'}
              </Button>
            </div>
          </div>
        </details>
      </main>

      {aiEnabled && <ChatWidget projectId={project.id} projectName={project.name} />}
    </div>
  )
}
