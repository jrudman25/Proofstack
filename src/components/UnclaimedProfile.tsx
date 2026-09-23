'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Button } from '@/components/ui/button'
import { clientErrorMessage } from '@/lib/client-error-message'
import type { UnclaimedAnalysis } from '@/types'

// Visitor-facing automated preview for a GitHub user with no claimed
// Proofstack profile. Everything rendered here is either public GitHub
// metadata or generated output; the unclaimed and automated labels are the
// boundary that keeps it visually distinct from owner-published profiles.
export default function UnclaimedProfile({ username, displayName, avatarUrl, publicRepoCount, initialAnalysis }: {
  username: string
  displayName: string | null
  avatarUrl: string | null
  publicRepoCount: number
  initialAnalysis: UnclaimedAnalysis | null
}) {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<UnclaimedAnalysis | null>(initialAnalysis)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setIsGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/public-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(clientErrorMessage(res, result, 'Unable to generate an analysis. Please try again.'))
        return
      }
      if (result.status === 'claimed' && typeof result.slug === 'string') {
        router.replace(`/u/${result.slug}`)
        return
      }
      if (result.status === 'ok' && result.analysis) {
        setAnalysis(result.analysis as UnclaimedAnalysis)
        return
      }
      setError('Unable to generate an analysis. Please try again.')
    } catch {
      setError('Unable to generate an analysis. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const name = displayName || username

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <section className="flex items-center gap-4">
        {avatarUrl && (
          <Image src={avatarUrl} alt="" width={56} height={56} className="h-14 w-14 rounded-full border border-line" />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <a
            href={`https://github.com/${username}`}
            className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-dim transition-colors hover:text-brand"
          >
            <GithubIcon className="h-3.5 w-3.5" /> @{username}
          </a>
        </div>
      </section>

      <section aria-labelledby="unclaimed-heading" className="corner-ticks relative border border-line bg-surface px-6 py-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="unclaimed-heading" className="text-xl font-semibold tracking-tight">Automated preview</h2>
          <p className="font-mono text-[10px] text-dim">
            Unclaimed profile{analysis ? ` · generated ${analysis.generatedAt.slice(0, 10)}` : ''}
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">
          {name} has not published a Proofstack profile. This preview is generated from public GitHub data only, is cached for up to 24 hours, and may be incomplete. {publicRepoCount} public {publicRepoCount === 1 ? 'repository' : 'repositories'} on GitHub.
        </p>

        {analysis ? (
          <div className="mt-5 border-t border-line pt-5">
            <p className="max-w-2xl text-sm leading-relaxed text-foreground/90">{analysis.summary}</p>
            {analysis.focusAreas.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {analysis.focusAreas.map(area => (
                  <li key={area} className="border border-line bg-ink px-2.5 py-1 font-mono text-[10px] text-dim">{area}</li>
                ))}
              </ul>
            )}
            {analysis.notableProjects.length > 0 && (
              <div className="mt-5 space-y-3">
                {analysis.notableProjects.map(project => (
                  <div key={project.name} className="border border-line bg-raised/40 px-4 py-3">
                    <a href={project.url} className="text-sm font-medium text-brand underline-offset-2 hover:underline">
                      {project.name}
                    </a>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/90">{project.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 border-t border-line pt-5">
            <Button variant="outline" disabled={isGenerating} onClick={generate} className="eyebrow">
              <Sparkles className="h-3.5 w-3.5" /> {isGenerating ? 'Generating' : 'Generate automated analysis'}
            </Button>
            {error && <p role="alert" className="mt-3 text-sm text-dim">{error}</p>}
          </div>
        )}
      </section>

      <footer className="border-t border-line pt-5 font-mono text-[10px] text-dim">
        Automated analysis of public GitHub data, not reviewed by the owner.{' '}
        Are you {name}?{' '}
        <Link href="/login" className="underline-offset-2 hover:text-brand hover:underline">Sign in to claim your profile</Link>
      </footer>
    </main>
  )
}
