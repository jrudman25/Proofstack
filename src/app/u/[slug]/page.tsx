import { cache } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { GitFork, Star } from 'lucide-react'
import { getPublicProfile } from '@/lib/public-profile'
import { GITHUB_USERNAME_PATTERN } from '@/lib/github/api'
import { getCachedUnclaimedAnalysis, getUnclaimedGate } from '@/lib/unclaimed-profile'
import { Logo } from '@/components/icons/Logo'
import { GithubIcon } from '@/components/icons/GithubIcon'
import ChatWidget from '@/components/ChatWidget'
import UnclaimedProfile from '@/components/UnclaimedProfile'
import type { ProjectLifecycleStatus, PublicProfile, PublishableBriefField } from '@/types'

// Public pages always read live publication state; unpublished or revoked
// content must disappear on the next request rather than linger in a cache.
export const dynamic = 'force-dynamic'

const loadProfile = cache((slug: string) => getPublicProfile(slug))
const loadGate = cache((slug: string) => getUnclaimedGate(slug))

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug
  const profile = await loadProfile(slug)
  if (!profile) {
    // Automated previews are temporary and must stay out of search indexes.
    const valid = GITHUB_USERNAME_PATTERN.test(slug.toLowerCase())
    return { title: valid ? `@${slug} · automated preview` : 'Profile not found', robots: { index: false, follow: false } }
  }
  const name = profile.fullName || profile.githubUsername
  return {
    title: `${name} · Proofstack`,
    description: profile.briefing?.summary ?? `${name} on Proofstack`,
  }
}

const LIFECYCLE_LABELS: Record<ProjectLifecycleStatus, string> = {
  prototype: 'Prototype', active: 'Active development', maintained: 'Maintained', completed: 'Completed', archived: 'Archived',
}

const FIELD_LABELS: Partial<Record<PublishableBriefField, string>> = {
  purpose: 'Purpose',
  inspiration: 'Inspiration',
  role_and_contributions: 'Role and contributions',
  architecture_and_decisions: 'Architecture and key decisions',
  challenges_and_solutions: 'Challenges and solutions',
  outcomes_and_impact: 'Outcomes and impact',
  lessons_learned: 'Lessons learned',
}

function relationship(project: PublicProfile['projects'][number], username: string): string | null {
  const { fork, ownerLogin, ownerType } = project.repository
  if (fork) return 'Fork'
  if (ownerLogin && ownerLogin.toLowerCase() !== username.toLowerCase()) {
    return ownerType === 'Organization' ? `${ownerLogin} organization` : `With ${ownerLogin}`
  }
  return null
}

export default async function PublicProfilePage({ params }: Props) {
  const { slug } = await params
  const profile = await loadProfile(slug)
  if (!profile) return <UnclaimedProfilePage slug={slug} />
  const name = profile.fullName || profile.githubUsername

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-line bg-ink/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo className="h-5 w-5 text-brand" />
          <span className="label font-bold tracking-[0.3em]">Proofstack</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
        <section className="flex items-center gap-4">
          {profile.avatarUrl && (
            <Image src={profile.avatarUrl} alt="" width={56} height={56} className="h-14 w-14 rounded-full border border-line" />
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <a
              href={`https://github.com/${profile.githubUsername}`}
              className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-dim transition-colors hover:text-brand"
            >
              <GithubIcon className="h-3.5 w-3.5" /> @{profile.githubUsername}
            </a>
          </div>
        </section>

        {profile.briefing && (
          <section aria-labelledby="briefing-heading" className="corner-ticks relative border border-line bg-surface px-6 py-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 id="briefing-heading" className="text-xl font-semibold tracking-tight">Portfolio briefing</h2>
              <p className="font-mono text-[10px] text-dim">
                AI generated, reviewed and published by the owner{profile.briefing.publishedAt ? ` on ${profile.briefing.publishedAt.slice(0, 10)}` : ''}
              </p>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90">{profile.briefing.summary}</p>

            {profile.briefing.spotlights.length > 0 && (
              <div className="mt-5 space-y-3">
                {profile.briefing.spotlights.map(spotlight => (
                  <div key={spotlight.project.name} className="border border-line bg-raised/40 px-4 py-3">
                    <a href={spotlight.project.url} className="text-sm font-medium text-brand underline-offset-2 hover:underline">
                      {spotlight.project.name}
                    </a>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/90">{spotlight.reason}</p>
                    {spotlight.talkingPoints.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-dim marker:text-faint">
                        {spotlight.talkingPoints.map((point, index) => <li key={index}>{point}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {profile.briefing.themes.length > 0 && (
              <dl className="mt-5 space-y-3 border-t border-line pt-5">
                {profile.briefing.themes.map(theme => (
                  <div key={theme.title}>
                    <dt className="eyebrow text-dim">{theme.title}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-foreground/90">{theme.detail}</dd>
                    <dd className="mt-1 font-mono text-[11px] text-dim">
                      {theme.projects.map(project => project.name).join(', ')}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {profile.briefing.growth && (
              <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-foreground/90">{profile.briefing.growth}</p>
            )}
          </section>
        )}

        <section aria-labelledby="projects-heading" className="space-y-4">
          <h2 id="projects-heading" className="label text-dim">
            Projects <span className="font-normal">{profile.projects.length}</span>
          </h2>
          {profile.projects.length === 0 && (
            <p className="border border-line bg-surface px-6 py-5 text-sm text-dim">No projects are published yet.</p>
          )}
          {profile.projects.map(project => {
            const relation = relationship(project, profile.githubUsername)
            const lifecycle = project.brief.lifecycle_status as ProjectLifecycleStatus | null | undefined
            const narrative = (Object.entries(project.brief) as [string, string | null][])
              .filter(([key, value]) => key !== 'lifecycle_status' && typeof value === 'string' && value.trim().length > 0)
            return (
              <article key={project.fullName} className="corner-ticks relative border border-line bg-surface px-6 py-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a href={project.url} className="text-base font-semibold text-brand underline-offset-2 hover:underline">
                    {project.name}
                  </a>
                  {relation && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-dim">
                      {relation === 'Fork' && <GitFork className="h-3 w-3" />}
                      {relation}
                    </span>
                  )}
                  {lifecycle && <span className="font-mono text-[10px] text-dim">{LIFECYCLE_LABELS[lifecycle]}</span>}
                </div>

                {project.description && (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/90">{project.description}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-dim">
                  {project.language && <span>{project.language}</span>}
                  {project.technologies.slice(0, 8).map(tech => <span key={tech}>{tech}</span>)}
                  {project.stargazersCount > 0 && (
                    <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{project.stargazersCount}</span>
                  )}
                  {project.pushedAt && <span>Updated {project.pushedAt.slice(0, 10)}</span>}
                </div>

                {narrative.length > 0 && (
                  <dl className="mt-4 space-y-4 border-t border-line pt-4">
                    <div className="flex items-center gap-2 font-mono text-[10px] text-dim">
                      Owner notes{project.ownerReviewed ? ' · owner reviewed' : ''}
                    </div>
                    {narrative.map(([key, value]) => (
                      <div key={key}>
                        <dt className="eyebrow text-dim">{FIELD_LABELS[key as PublishableBriefField] ?? key}</dt>
                        <dd className="mt-1 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </article>
            )
          })}
        </section>

        <footer className="border-t border-line pt-5 font-mono text-[10px] text-dim">
          Published by the owner on Proofstack
          {profile.publishedAt ? ` · since ${profile.publishedAt.slice(0, 10)}` : ''}.{' '}
          <Link href="/" className="underline-offset-2 hover:text-brand hover:underline">Create your own</Link>
          {' · '}
          <Link href="/help" className="underline-offset-2 hover:text-brand hover:underline">Help</Link>
        </footer>
      </main>
      <ChatWidget publicSlug={profile.slug} publicName={name} />
    </div>
  )
}

// Fallback for GitHub users with no published Proofstack profile: a clearly
// labeled automated preview generated on demand from public GitHub data.
async function UnclaimedProfilePage({ slug }: { slug: string }) {
  const normalized = slug.toLowerCase()
  if (!GITHUB_USERNAME_PATTERN.test(normalized)) notFound()
  const gate = await loadGate(normalized)
  if (gate.status === 'claimed') redirect(`/u/${gate.slug}`)
  if (gate.status === 'blocked') notFound()

  const analysis = await getCachedUnclaimedAnalysis(normalized)

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-line bg-ink/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo className="h-5 w-5 text-brand" />
          <span className="label font-bold tracking-[0.3em]">Proofstack</span>
        </div>
      </header>
      <UnclaimedProfile username={normalized} initialAnalysis={analysis} />
    </div>
  )
}
