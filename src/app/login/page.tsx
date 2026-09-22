'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const handleGithubLogin = async () => {
    setPending(true)
    setError('')
    const supabase = createClient()
    // Read-only public-repository access by default; `repo` is only requested
    // later if the owner chooses to include private repositories.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: 'public_repo read:user user:email'
      },
    })
    if (oauthError) {
      setPending(false)
      setError('Unable to start GitHub sign-in. Please try again.')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-sans">
      <div className="mb-10 flex items-center gap-3">
        <Logo className="h-8 w-8 text-brand" />
        <span className="label text-base font-bold tracking-[0.35em]">
          Proofstack
        </span>
      </div>

      <div className="grid w-full max-w-4xl gap-4 lg:grid-cols-2">
        <div className="corner-ticks relative border border-line bg-surface p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Know your own work before the interview
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-dim">
            Proofstack turns your GitHub repositories and your own notes into an evidence-backed briefing you can talk through.
          </p>

          <Button
            onClick={handleGithubLogin}
            disabled={pending}
            size="lg"
            className="label mt-8 w-full"
          >
            <GithubIcon className="h-4 w-4" />
            {pending ? 'Redirecting to GitHub' : 'Sign in with GitHub'}
          </Button>

          {error && <p role="alert" className="mt-4 text-center font-mono text-[11px] text-dim">{error}</p>}

          <h2 className="label mt-8 text-dim">How it works</h2>
          <ol className="mt-4 space-y-3">
            {[
              ['01', 'Sync repositories', 'Import your public GitHub repositories.'],
              ['02', 'Add your context', 'Record your role and decisions per project.'],
              ['03', 'Prepare a briefing', 'Review themes, spotlights, and practice questions.'],
            ].map(([number, title, detail]) => (
              <li key={number} className="border-l border-line-bright pl-3">
                <span className="eyebrow text-brand">{number}</span>
                <span className="ml-2 text-sm font-medium text-foreground">{title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-dim">{detail}</span>
              </li>
            ))}
          </ol>
        </div>

        <section aria-labelledby="preview-heading" className="border border-line bg-surface p-8">
          <h2 id="preview-heading" className="label text-dim">Illustrative briefing preview</h2>
          <p className="mt-2 text-xs leading-relaxed text-dim">
            This is an example of the briefing format, not an analysis of you or your repositories.
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <h3 className="eyebrow text-brand">Portfolio theme</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                Typed web applications with an emphasis on tested, well-documented interfaces.
              </p>
            </div>
            <div>
              <h3 className="eyebrow text-brand">Project spotlight</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                A sample project might be spotlighted for clear API design or a documented migration.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                Talking points explain what was built and which decisions mattered.
              </p>
            </div>
            <div>
              <h3 className="eyebrow text-brand">Practice question</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                Which tradeoffs shaped your data model, and what would you revisit?
              </p>
            </div>
          </div>
        </section>
      </div>

      <p className="eyebrow mt-8 text-center text-dim">
        GitHub access: public_repo · read:user · user:email
      </p>
      <a href="/privacy" className="eyebrow mt-3 text-dim transition-colors hover:text-foreground">
        Privacy and data use
      </a>
    </div>
  )
}
