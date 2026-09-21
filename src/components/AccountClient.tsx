'use client'

import { useState } from 'react'
import { ArrowLeft, ExternalLink, Globe, LogOut, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { clientErrorMessage } from '@/lib/client-error-message'

type Publication = {
  slug: string | null
  published: boolean
  briefingPublishedAt: string | null
  hasBriefing: boolean
}

type ProfileResponse = {
  public_slug: string | null
  profile_published: boolean
  profile_published_at: string | null
  public_briefing_published_at: string | null
}

export default function AccountClient({ email, publication }: { email: string | null; publication: Publication }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [slug, setSlug] = useState(publication.slug ?? '')
  const [profile, setProfile] = useState(publication)
  const [isSaving, setIsSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')

  const patchProfile = async (body: Record<string, unknown>, fallback: string) => {
    setIsSaving(true)
    setProfileMessage('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) {
        setProfileMessage(clientErrorMessage(res, result, fallback))
        return
      }
      const saved = result.profile as ProfileResponse
      setProfile(current => ({
        ...current,
        slug: saved.public_slug,
        published: saved.profile_published,
        briefingPublishedAt: saved.public_briefing_published_at ?? current.briefingPublishedAt,
      }))
      if (saved.public_slug) setSlug(saved.public_slug)
      setProfileMessage('Saved.')
    } catch {
      setProfileMessage(fallback)
    } finally {
      setIsSaving(false)
    }
  }

  const publicUrl = profile.slug && profile.published ? `/u/${profile.slug}` : null

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
          <h2 className="label text-dim">Public profile</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-dim">
            Publish a curated view of your portfolio. Only projects selected in their brief and the fields you checked appear publicly; private repositories are never shown.
          </p>

          <div className="mt-4 space-y-4">
            <label className="block space-y-2">
              <span className="eyebrow text-dim">Profile URL</span>
              <span className="flex items-center gap-0">
                <span className="border border-r-0 border-line bg-ink px-3 py-2 font-mono text-[11px] text-dim">/u/</span>
                <input
                  aria-label="Profile URL slug"
                  value={slug}
                  onChange={event => setSlug(event.target.value)}
                  placeholder="your-github-username"
                  className="field w-full max-w-xs px-3 py-2 font-mono text-[13px]"
                />
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={isSaving} onClick={() => patchProfile({ slug }, 'Unable to save the profile URL.')} className="eyebrow">
                Save URL
              </Button>
              <Button
                variant={profile.published ? 'outline' : 'default'}
                disabled={isSaving}
                onClick={() => patchProfile({ published: !profile.published }, 'Unable to update publication.')}
                className="eyebrow"
              >
                <Globe className="h-3.5 w-3.5" /> {profile.published ? 'Unpublish profile' : 'Publish profile'}
              </Button>
              <Button
                variant="outline"
                disabled={isSaving || !profile.hasBriefing}
                onClick={() => patchProfile({ publishBriefing: true }, 'Unable to publish the briefing.')}
                className="eyebrow"
                title={profile.hasBriefing ? 'Copy the current portfolio briefing to your public profile' : 'Generate a portfolio briefing first'}
              >
                Publish latest briefing
              </Button>
            </div>

            <div className="space-y-1 font-mono text-[11px] text-dim">
              {publicUrl && (
                <p>
                  Live at{' '}
                  <Link href={publicUrl} className="text-brand underline-offset-2 hover:underline">
                    {publicUrl}
                  </Link>{' '}
                  <ExternalLink className="inline h-3 w-3" />
                </p>
              )}
              {profile.briefingPublishedAt && (
                <p>Briefing snapshot published {new Date(profile.briefingPublishedAt).toISOString().slice(0, 10)}. Regenerating your briefing does not change the public copy.</p>
              )}
              {profileMessage && <p role="status">{profileMessage}</p>}
            </div>
          </div>
        </section>

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
