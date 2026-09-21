'use client'

import { useState } from 'react'
import { ArrowLeft, LogOut, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'

export default function AccountClient({ email }: { email: string | null }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setMessage('')
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) {
        setMessage('Unable to delete your account. Please try again.')
        return
      }
      const supabase = createClient()
      await supabase.auth.signOut()
      router.replace('/login')
    } catch {
      setMessage('Unable to delete your account. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-line bg-ink/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-5 w-5 text-brand" />
            <span className="label font-bold tracking-[0.3em]">Proofstack</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
        <Link href="/" className="label inline-flex items-center gap-2 text-dim transition-colors hover:text-brand">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        {email && <p className="font-mono text-[11px] text-dim">{email}</p>}

        <section className="corner-ticks relative border border-line bg-surface px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="label text-dim">Session</h2>
              <p className="mt-1 text-sm text-dim">Sign out of this browser.</p>
            </div>
            <Button variant="outline" onClick={handleSignOut} className="eyebrow shrink-0">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </section>

        <section className="border border-red-900/60 bg-surface px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="label text-dim">Delete account</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-dim">
                Permanently removes your profile, projects, project briefs, portfolio briefings, embedded README evidence, and your stored GitHub credential. This cannot be undone.
              </p>
              {message && <p role="status" className="mt-2 font-mono text-[11px] text-dim">{message}</p>}
            </div>
            {confirming ? (
              <div className="flex shrink-0 items-center gap-3">
                <Button variant="ghost" onClick={() => setConfirming(false)} className="eyebrow">Cancel</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="eyebrow">
                  <Trash2 className="h-3.5 w-3.5" /> {isDeleting ? 'Deleting' : 'Confirm delete'}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirming(true)} className="eyebrow shrink-0">
                Delete account
              </Button>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
