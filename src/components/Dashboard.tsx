'use client'

import { useState, useMemo } from 'react'
import { Project } from '@/types'
import { RefreshCw, Star, LogOut } from 'lucide-react'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { languageColor } from '@/lib/language-colors'
import Link from 'next/link'
import Image from 'next/image'

const mapTechToDevicon = (tech: string) => {
  const t = tech.toLowerCase()
  if (t.includes('react')) return 'devicon-react-original'
  if (t.includes('next')) return 'devicon-nextjs-original'
  if (t.includes('node') || t.includes('express')) return 'devicon-nodejs-plain'
  if (t.includes('typescript') || t === 'ts') return 'devicon-typescript-plain'
  if (t.includes('javascript') || t === 'js') return 'devicon-javascript-plain'
  if (t.includes('python')) return 'devicon-python-plain'
  if (t.includes('go')) return 'devicon-go-original-wordmark'
  if (t.includes('rust')) return 'devicon-rust-original'
  if (t.includes('postgres') || t.includes('sql')) return 'devicon-postgresql-plain'
  if (t.includes('tailwind')) return 'devicon-tailwindcss-original'
  if (t.includes('html')) return 'devicon-html5-plain'
  if (t.includes('css')) return 'devicon-css3-plain'
  return null
}

const SORTS = [
  { key: 'updated', label: 'Recently Updated' },
  { key: 'stars', label: 'Most Stars' },
  { key: 'name', label: 'Alphabetical' },
] as const

type DashboardUser = {
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

const isoDate = (value: string | null) => {
  if (!value) return '----.--.--'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '----.--.--' : d.toISOString().slice(0, 10)
}

export default function Dashboard({
  initialProjects,
  user,
}: {
  initialProjects: Project[]
  user?: DashboardUser | null
}) {
  const [projects] = useState<Project[]>(initialProjects)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'updated' | 'stars' | 'name'>('updated')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncMessage('')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncMessage(`Synced ${data.syncedCount} projects. Refreshing...`)
        // In a real app, we would re-fetch projects from Supabase here
        window.location.reload()
      } else {
        setSyncMessage('Unable to sync projects. Please try again.')
      }
    } catch {
      setSyncMessage('Unable to sync projects. Please try again.')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const filteredAndSorted = useMemo(() => {
    const result = projects.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (p.technologies || []).some(t => t.toLowerCase().includes(search.toLowerCase()))
    )

    result.sort((a, b) => {
      if (sort === 'updated') {
        const dateA = a.pushed_at || a.updated_at
        const dateB = b.pushed_at || b.updated_at
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      }
      if (sort === 'stars') return b.stargazers_count - a.stargazers_count
      if (sort === 'name') return a.name.localeCompare(b.name)
      return 0
    })

    return result
  }, [projects, search, sort])

  return (
    <div className="min-h-screen font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <Logo className="h-6 w-6 text-brand" />
            <h1 className="hidden font-mono text-sm font-bold uppercase tracking-[0.3em] sm:block">
              Proofstack
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {syncMessage && (
              <span role="status" className="hidden font-mono text-[11px] text-faint sm:inline">
                {syncMessage}
              </span>
            )}
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              aria-label="Sync GitHub"
              className="font-mono text-[10px] uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.15em]"
            >
              <RefreshCw className={isSyncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Sync GitHub</span>
              <span className="sm:hidden">Sync</span>
            </Button>

            {user && (
              <div className="flex items-center gap-3 border-l border-line pl-4">
                {user.avatarUrl && (
                  <Image
                    src={user.avatarUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 border border-line"
                  />
                )}
                {(user.handle || user.displayName) && (
                  <span className="hidden font-mono text-[11px] text-zinc-400 sm:inline">
                    {user.handle ? `@${user.handle}` : user.displayName}
                  </span>
                )}
                <button
                  onClick={handleSignOut}
                  aria-label="Sign out"
                  className="text-faint transition-colors hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        {/* Index strip */}
        <div className="flex items-center justify-between border-b border-line py-4 font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
          <span>Portfolio_Index</span>
          <span>
            {filteredAndSorted.length === projects.length
              ? `${projects.length} records`
              : `${filteredAndSorted.length} / ${projects.length} records`}
          </span>
        </div>

        {/* Toolbar */}
        <section className="flex flex-col items-stretch justify-between gap-4 py-5 md:flex-row md:items-center">
          <div className="relative w-full md:w-96">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-mono text-xs text-brand">
              &gt;
            </span>
            <input
              type="text"
              aria-label="Search projects and technologies"
              placeholder="search index_"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-line bg-surface py-2 pl-8 pr-3 font-mono text-sm placeholder:text-faint focus:border-brand-dim focus:outline-none"
            />
          </div>

          <div role="group" aria-label="Sort projects" className="flex w-full divide-x divide-line overflow-x-auto border border-line md:w-auto">
            {SORTS.map(({ key, label }) => (
              <button
                key={key}
                aria-pressed={sort === key}
                onClick={() => setSort(key)}
                className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors whitespace-nowrap ${
                  sort === key
                    ? 'bg-raised text-brand'
                    : 'text-faint hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Records grid */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAndSorted.map((project, i) => (
            <article
              key={project.id}
              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
              className="corner-ticks group relative flex animate-rise flex-col border border-line bg-surface transition-colors hover:border-line-bright"
            >
              {/* accent edge on hover */}
              <span className="absolute inset-y-3 left-0 w-px bg-brand opacity-0 transition-opacity group-hover:opacity-100" />

              <div className="flex items-center justify-between px-5 pt-4">
                <span className="font-mono text-[10px] tracking-[0.25em] text-faint transition-colors group-hover:text-brand">
                  R-{String(i + 1).padStart(3, '0')}
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={project.html_url}
                    aria-label={`View ${project.name} on GitHub (opens in new tab)`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <GithubIcon className="h-3.5 w-3.5" />
                  </a>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-faint">
                    <Star className="h-3 w-3 text-amber-300/80" />
                    {project.stargazers_count}
                  </span>
                </div>
              </div>

              <div className="flex flex-grow flex-col px-5 pb-5 pt-2">
                <Link
                  href={`/project/${project.id}`}
                  className="text-lg font-semibold tracking-tight transition-colors hover:text-brand"
                >
                  {project.name}
                </Link>

                {project.summary ? (
                  <p className="mt-2 flex-grow text-sm leading-relaxed text-zinc-400">
                    {project.summary}
                  </p>
                ) : (
                  <p className="mt-2 flex-grow text-sm italic text-faint">
                    {project.description || 'No description available.'}
                  </p>
                )}
              </div>

              <footer className="mt-auto border-t border-line px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {project.language && (
                      <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: languageColor(project.language) }}
                        />
                        {project.language}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      {(project.technologies || []).slice(0, 5).map(tech => {
                        const iconClass = mapTechToDevicon(tech)
                        return (
                          <span key={tech} className="group/tooltip relative flex items-center">
                            {iconClass ? (
                              <i className={`${iconClass} text-base text-zinc-500 transition-colors group-hover/tooltip:text-foreground`} />
                            ) : (
                              <span
                                className="font-mono text-[9px] tracking-wider"
                                style={{ color: languageColor(tech) }}
                              >
                                {tech.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 opacity-0 transition-opacity group-hover/tooltip:opacity-100">
                              {tech}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <span className="whitespace-nowrap font-mono text-[10px] text-faint">
                    {isoDate(project.pushed_at || project.updated_at)}
                  </span>
                </div>
              </footer>
            </article>
          ))}

          {filteredAndSorted.length === 0 && (
            <div className="corner-ticks relative col-span-full flex flex-col items-center justify-center border border-dashed border-line py-20 text-center">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
                ERR_NO_RECORDS
              </span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-200">No projects found</h3>
              <p className="mt-1 max-w-md text-sm text-faint">
                Try syncing your GitHub account or adjusting your search filters to see your repositories.
              </p>
              <Button onClick={handleSync} variant="outline" className="mt-6 font-mono text-[11px] uppercase tracking-[0.15em]">
                <RefreshCw className="h-3.5 w-3.5" /> Sync Now
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
