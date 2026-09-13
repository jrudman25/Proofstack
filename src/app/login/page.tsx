'use client'

import { createClient } from '@/utils/supabase/client'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const handleGithubLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // Request additional scopes to access repositories and webhooks
        scopes: 'repo read:user user:email admin:repo_hook'
      },
    })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-sans">
      <div className="mb-10 flex items-center gap-3">
        <Logo className="h-8 w-8 text-brand" />
        <span className="font-mono text-base font-bold uppercase tracking-[0.35em]">
          Proofstack
        </span>
      </div>

      <div className="corner-ticks relative w-full max-w-md border border-line bg-surface p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
          Auth // GitHub_OAuth
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Sign in to index your work
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Proofstack syncs your repositories, extracts stack metadata, and answers questions from indexed READMEs.
        </p>

        <Button
          onClick={handleGithubLogin}
          size="lg"
          className="mt-8 w-full font-mono text-[12px] uppercase tracking-[0.15em]"
        >
          <GithubIcon className="h-4 w-4" />
          Sign in with GitHub
        </Button>
      </div>

      <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
        scopes: repo · read:user · admin:repo_hook
      </p>
    </div>
  )
}
