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
        // `repo` is required to read private repositories; webhooks are configured manually.
        scopes: 'repo read:user user:email'
      },
    })
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
          size="lg"
          className="label mt-8 w-full"
        >
          <GithubIcon className="h-4 w-4" />
          Sign in with GitHub
        </Button>
      </div>

      <p className="eyebrow mt-8 text-center text-faint">
        GitHub access: repo · read:user · user:email
      </p>
    </div>
  )
}
