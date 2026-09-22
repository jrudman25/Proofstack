'use client'

import { useState } from 'react'
import { ArrowLeft, Download, ExternalLink, Globe, LogOut, RefreshCw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { clientErrorMessage } from '@/lib/client-error-message'

export type PublicationProject = {
  id: string
  name: string
  isPrivate: boolean
  visibility: 'private' | 'public'
  publishedFields: string[]
}

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

export default function AccountClient({ email, publication, publicationProjects, publicationProjectsFailed = false }: {
  email: string | null
  publication: Publication
  publicationProjects: PublicationProject[]
  publicationProjectsFailed?: boolean
}) {
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

  const eligibleProjects = publicationProjects.filter(project => !project.isPrivate)
  const excludedPrivate = publicationProjects.length - eligibleProjects.length
  const selectedProjectCount = eligibleProjects.filter(
    project => project.visibility === 'public' && project.publishedFields.length > 0,
  ).length
  const publishBlockers: string[] = []
  if (!profile.slug) publishBlockers.push('Save a profile URL first.')
  if (publicationProjectsFailed) publishBlockers.push('Reload the page so project publication state can be verified.')
  else if (selectedProjectCount === 0) publishBlockers.push('Select at least one field on a public project brief.')
  const canPublish = publishBlockers.length === 0

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

        <section aria-labelledby="public-profile-heading" className="corner-ticks relative border border-line bg-surface px-6 py-5">
          <h2 id="public-profile-heading" className="label text-dim">Public profile</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-dim">
            Publish a curated view of your portfolio. Only projects selected in their brief and the fields you checked appear publicly; private repositories are never shown.
          </p>

          <ol className="mt-5 space-y-6">
            <li className="border-l border-line-bright pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="eyebrow text-foreground">01 · Profile URL</h3>
                <span className="font-mono text-[10px] text-dim">{profile.slug ? `Saved: /u/${profile.slug}` : 'Not saved'}</span>
              </div>
              <label className="mt-3 block space-y-2">
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
              <Button variant="outline" disabled={isSaving} onClick={() => patchProfile({ slug }, 'Unable to save the profile URL.')} className="eyebrow mt-3">
                Save URL
              </Button>
            </li>

            <li className="border-l border-line-bright pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="eyebrow text-foreground">02 · Public projects</h3>
                {!publicationProjectsFailed && (
                  <span className="font-mono text-[10px] text-dim">
                    {selectedProjectCount} {selectedProjectCount === 1 ? 'selected project' : 'selected projects'}
                  </span>
                )}
              </div>
              {publicationProjectsFailed ? (
                <div className="mt-3">
                  <p role="alert" className="text-sm leading-relaxed text-dim">
                    Your projects could not be loaded, so publication state cannot be verified. Publishing stays disabled.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => router.refresh()} className="eyebrow mt-3">
                    <RefreshCw className="h-3.5 w-3.5" /> Reload
                  </Button>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-dim">
                    Choose which projects appear and which brief fields each one publishes.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {eligibleProjects.map(project => (
                      <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 border border-line bg-ink px-3 py-2">
                        <Link href={`/project/${project.id}#publication-settings`} className="text-sm text-brand underline-offset-2 hover:underline">
                          {project.name}
                        </Link>
                        <span className="font-mono text-[10px] text-dim">
                          {project.visibility === 'public'
                            ? `Selected, ${project.publishedFields.length} ${project.publishedFields.length === 1 ? 'field' : 'fields'}`
                            : 'Not selected'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {eligibleProjects.length === 0 && (
                    <p className="mt-3 font-mono text-[11px] text-dim">No public repositories synced yet.</p>
                  )}
                  {excludedPrivate > 0 && (
                    <p className="mt-3 font-mono text-[11px] text-dim">
                      {excludedPrivate} private {excludedPrivate === 1 ? 'repository' : 'repositories'} excluded and never shown.
                    </p>
                  )}
                </>
              )}
            </li>

            <li className="border-l border-line-bright pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="eyebrow text-foreground">03 · Briefing snapshot</h3>
                <span className="font-mono text-[10px] text-dim">
                  {profile.briefingPublishedAt
                    ? `Published ${new Date(profile.briefingPublishedAt).toISOString().slice(0, 10)}`
                    : 'No snapshot'}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-dim">
                Publishing copies the current briefing so regenerating your private briefing does not change the public copy.
              </p>
              <Button
                variant="outline"
                disabled={isSaving || !profile.hasBriefing}
                onClick={() => patchProfile({ publishBriefing: true }, 'Unable to publish the briefing.')}
                className="eyebrow mt-3"
                title={profile.hasBriefing ? 'Copy the current portfolio briefing to your public profile' : 'Generate a portfolio briefing first'}
              >
                Publish latest briefing
              </Button>
              {!profile.hasBriefing && (
                <p className="mt-2 font-mono text-[10px] text-dim">Generate a briefing on the dashboard first.</p>
              )}
            </li>

            <li className="border-l border-line-bright pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="eyebrow text-foreground">04 · Profile state</h3>
                <span className="font-mono text-[10px] text-dim">{profile.published ? 'Live' : 'Not live'}</span>
              </div>
              {!profile.published && publishBlockers.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-dim">
                  {publishBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                </ul>
              )}
              <Button
                variant={profile.published ? 'outline' : 'default'}
                disabled={isSaving || (!profile.published && !canPublish)}
                onClick={() => patchProfile({ published: !profile.published }, 'Unable to update publication.')}
                className="eyebrow mt-3"
              >
                <Globe className="h-3.5 w-3.5" /> {profile.published ? 'Unpublish profile' : 'Publish profile'}
              </Button>
            </li>

            {publicUrl && (
              <li className="border-l border-brand pl-4">
                <h3 className="eyebrow text-foreground">05 · Preview</h3>
                <p className="mt-2 font-mono text-[11px] text-dim">
                  Live at{' '}
                  <Link href={publicUrl} className="text-brand underline-offset-2 hover:underline">
                    {publicUrl}
                  </Link>{' '}
                  <ExternalLink className="inline h-3 w-3" />
                </p>
              </li>
            )}
          </ol>

          {profileMessage && <p role="status" className="mt-4 font-mono text-[11px] text-dim">{profileMessage}</p>}
        </section>

        <section className="border border-line bg-surface px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="label text-dim">Legacy tasks and milestones</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-dim">
                Task tracking is retired. Your existing records are preserved and remain available as a JSON download.
              </p>
            </div>
            <a
              href="/api/account/legacy-export"
              className="eyebrow inline-flex shrink-0 items-center gap-2 border border-line px-3 py-2 text-dim transition-colors hover:border-line-bright hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" /> Download JSON
            </a>
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
