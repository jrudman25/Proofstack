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

      <div className="corner-ticks relative w-full max-w-md border border-line bg-surface p-8">
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
      </div>

      <p className="eyebrow mt-8 text-center text-dim">
        GitHub access: public_repo · read:user · user:email
      </p>
      <a href="/privacy" className="eyebrow mt-3 text-faint transition-colors hover:text-dim">
        Privacy and data use
      </a>
    </div>
  )
}
