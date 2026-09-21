'use client'

import { useState, useMemo, useEffect, useEffectEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardProject, StoredBriefing } from '@/types'
import { RefreshCw, Star, LogOut, Lock, Settings } from 'lucide-react'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { TechBrandIcon, techBrandMark } from '@/components/icons/TechBrandIcon'
import { Logo } from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { languageColor } from '@/lib/language-colors'
import { normalizeTechnology } from '@/lib/package-technologies'
import { clientErrorMessage } from '@/lib/client-error-message'
import Link from 'next/link'
import Image from 'next/image'
import PortfolioBriefingPanel from '@/components/PortfolioBriefingPanel'
import ChatWidget from '@/components/ChatWidget'
import packageJson from '../../package.json'

// Keys are technology names normalized to lowercase alphanumerics so that
// "Next.js", "NextJS" and "nextjs" resolve to the same icon without substring
// matching (which mapped MongoDB to Go and MySQL to PostgreSQL).
const DEVICON_BY_TECHNOLOGY: Record<string, string> = {
  react: 'devicon-react-original',
  nextjs: 'devicon-nextjs-original',
  next: 'devicon-nextjs-original',
  node: 'devicon-nodejs-plain',
  nodejs: 'devicon-nodejs-plain',
  express: 'devicon-express-original',
  typescript: 'devicon-typescript-plain',
  ts: 'devicon-typescript-plain',
  javascript: 'devicon-javascript-plain',
  js: 'devicon-javascript-plain',
  python: 'devicon-python-plain',
  go: 'devicon-go-original-wordmark',
  golang: 'devicon-go-original-wordmark',
  rust: 'devicon-rust-original',
  postgresql: 'devicon-postgresql-plain',
  postgres: 'devicon-postgresql-plain',
  mysql: 'devicon-mysql-plain',
  mongodb: 'devicon-mongodb-plain',
  tailwindcss: 'devicon-tailwindcss-original',
  html: 'devicon-html5-plain',
  html5: 'devicon-html5-plain',
  css: 'devicon-css3-plain',
  css3: 'devicon-css3-plain',
  vue: 'devicon-vuejs-plain',
  svelte: 'devicon-svelte-plain',
  angular: 'devicon-angularjs-plain',
  docker: 'devicon-docker-plain',
  supabase: 'devicon-supabase-plain',
  firebase: 'devicon-firebase-plain',
  vite: 'devicon-vitejs-plain',
  mui: 'devicon-materialui-plain',
  materialui: 'devicon-materialui-plain',
  reactrouter: 'devicon-reactrouter-plain',
  redux: 'devicon-redux-original',
  sass: 'devicon-sass-original',
  webpack: 'devicon-webpack-plain',
  babel: 'devicon-babel-plain',
  bootstrap: 'devicon-bootstrap-plain',
  reactbootstrap: 'devicon-reactbootstrap-original',
  storybook: 'devicon-storybook-plain',
  eslint: 'devicon-eslint-plain',
  nuxt: 'devicon-nuxtjs-plain',
  astro: 'devicon-astro-plain',
  gatsby: 'devicon-gatsby-original',
  fastify: 'devicon-fastify-plain',
  electron: 'devicon-electron-original',
  prisma: 'devicon-prisma-original',
  vitest: 'devicon-vitest-plain',
  jest: 'devicon-jest-plain',
  playwright: 'devicon-playwright-plain',
  cypress: 'devicon-cypressio-plain',
  nestjs: 'devicon-nestjs-original',
  remix: 'devicon-remix-original',
  sveltekit: 'devicon-svelte-plain',
  cloudflare: 'devicon-cloudflare-plain',
  // Languages (GitHub /languages names, normalized)
  java: 'devicon-java-plain',
  kotlin: 'devicon-kotlin-plain',
  swift: 'devicon-swift-plain',
  ruby: 'devicon-ruby-plain',
  php: 'devicon-php-plain',
  c: 'devicon-c-original',
  cplusplus: 'devicon-cplusplus-plain',
  csharp: 'devicon-csharp-plain',
  fsharp: 'devicon-fsharp-plain',
  dart: 'devicon-dart-plain',
  scala: 'devicon-scala-plain',
  haskell: 'devicon-haskell-plain',
  lua: 'devicon-lua-plain',
  elixir: 'devicon-elixir-plain',
  erlang: 'devicon-erlang-plain',
  clojure: 'devicon-clojure-plain',
  clojurescript: 'devicon-clojurescript-plain',
  shell: 'devicon-bash-plain',
  bash: 'devicon-bash-plain',
  powershell: 'devicon-powershell-plain',
  r: 'devicon-r-plain',
  jupyternotebook: 'devicon-jupyter-plain',
  jupyter: 'devicon-jupyter-plain',
  groovy: 'devicon-groovy-plain',
  objectivec: 'devicon-objectivec-plain',
  objectivecplusplus: 'devicon-objectivec-plain',
  perl: 'devicon-perl-plain',
  ocaml: 'devicon-ocaml-plain',
  julia: 'devicon-julia-plain',
  elm: 'devicon-elm-plain',
  tex: 'devicon-latex-original',
  latex: 'devicon-latex-original',
  zig: 'devicon-zig-original',
  nim: 'devicon-nim-plain',
  matlab: 'devicon-matlab-plain',
  crystal: 'devicon-crystal-plain',
  solidity: 'devicon-solidity-plain',
  markdown: 'devicon-markdown-original',
  json: 'devicon-json-plain',
  yaml: 'devicon-yaml-plain',
  scss: 'devicon-sass-original',
  less: 'devicon-less-plain-wordmark',
  stylus: 'devicon-stylus-original',
  cmake: 'devicon-cmake-plain',
  dockerfile: 'devicon-docker-plain',
  hcl: 'devicon-terraform-plain',
  nix: 'devicon-nixos-plain',
  nixos: 'devicon-nixos-plain',
  gdscript: 'devicon-godot-plain',
  vimscript: 'devicon-vim-plain',
  webassembly: 'devicon-wasm-original',
  wasm: 'devicon-wasm-original',
  glsl: 'devicon-opengl-plain',
  opengl: 'devicon-opengl-plain',
  // Build tools, frameworks, and platforms detected from root manifests
  maven: 'devicon-maven-plain',
  gradle: 'devicon-gradle-original',
  dockercompose: 'devicon-docker-plain',
  django: 'devicon-django-plain',
  laravel: 'devicon-laravel-original',
  rails: 'devicon-rails-plain',
  rubyonrails: 'devicon-rails-plain',
  composer: 'devicon-composer-line',
  npm: 'devicon-npm-original-wordmark',
  pnpm: 'devicon-pnpm-plain',
  yarn: 'devicon-yarn-original',
  bun: 'devicon-bun-plain',
  poetry: 'devicon-poetry-plain',
  net: 'devicon-dot-net-plain',
  dotnet: 'devicon-dot-net-plain',
  dotnetcore: 'devicon-dotnetcore-plain',
  aspnet: 'devicon-dot-net-plain',
  terraform: 'devicon-terraform-plain',
  jenkins: 'devicon-jenkins-plain',
  gitlab: 'devicon-gitlab-plain',
  circleci: 'devicon-circleci-plain',
  azure: 'devicon-azure-plain',
  travisci: 'devicon-travis-plain',
  heroku: 'devicon-heroku-original',
  vercel: 'devicon-vercel-original',
  netlify: 'devicon-netlify-plain',
  helm: 'devicon-helm-original',
  ansible: 'devicon-ansible-plain',
  vagrant: 'devicon-vagrant-plain',
  tauri: 'devicon-tauri-plain',
  wordpress: 'devicon-wordpress-plain',
  xcode: 'devicon-xcode-plain',
  capacitor: 'devicon-capacitor-plain',
  ionic: 'devicon-ionic-original',
  githubactions: 'devicon-githubactions-plain',
  // Additional package-derived technologies
  reactnative: 'devicon-reactnative-original',
  mongoose: 'devicon-mongoose-original',
  graphql: 'devicon-graphql-plain',
  expo: 'devicon-expo-original',
  d3js: 'devicon-d3js-plain',
  threejs: 'devicon-threejs-original',
  styledcomponents: 'devicon-styledcomponents-plain',
  jquery: 'devicon-jquery-plain',
  alpinejs: 'devicon-alpinejs-original',
  socketio: 'devicon-socketio-original',
  zustand: 'devicon-zustand-plain',
  mobx: 'devicon-mobx-plain',
  sanity: 'devicon-sanity-plain',
  axios: 'devicon-axios-plain',
  chakraui: 'devicon-chakraui-plain',
  trpc: 'devicon-trpc-plain',
  aws: 'devicon-amazonwebservices-plain-wordmark',
  amazonwebservices: 'devicon-amazonwebservices-plain-wordmark',
  ember: 'devicon-ember-plain',
  backbonejs: 'devicon-backbonejs-plain',
  redis: 'devicon-redis-plain',
}
const deviconFor = (tech: string) => DEVICON_BY_TECHNOLOGY[normalizeTechnology(tech)] ?? null

const stackTechnologies = (project: DashboardProject) => {
  const technologies = new Map<string, string>()
  for (const candidate of [project.language, ...(project.technologies || [])]) {
    const technology = candidate?.trim()
    if (!technology) continue
    const normalized = normalizeTechnology(technology)
    if (!technologies.has(normalized)) technologies.set(normalized, technology)
  }
  return Array.from(technologies.values())
}

// Survives the GitHub re-authorization redirect so the dashboard knows to
// re-sync and import the newly visible private repositories.
const CONNECT_PRIVATE_PENDING = 'proofstack:connect-private'

const SORTS = [
  { key: 'updated', label: 'Recently Updated' },
  { key: 'stars', label: 'Most Stars' },
  { key: 'name', label: 'Alphabetical' },
] as const

const LIFECYCLE_LABELS: Record<string, string> = {
  prototype: 'Prototype', active: 'Active', maintained: 'Maintained', completed: 'Completed', archived: 'Archived',
}

type DashboardUser = {
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

const isoDate = (value: string | null | undefined) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export default function Dashboard({
  initialProjects,
  user,
  lastSyncedAt = null,
  privateReposConnected = true,
  initialBriefing = null,
  loadError = false,
}: {
  initialProjects: DashboardProject[]
  user?: DashboardUser | null
  lastSyncedAt?: string | null
  privateReposConnected?: boolean
  initialBriefing?: StoredBriefing | null
  loadError?: boolean
}) {
  const router = useRouter()
  // Read server-provided projects directly so router.refresh() actually
  // updates cards, counts, sync date, and briefing eligibility.
  const projects = initialProjects
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'updated' | 'stars' | 'name'>('updated')
  const [repositoryVisibility, setRepositoryVisibility] = useState<'all' | 'public' | 'private'>('all')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [connectMessage, setConnectMessage] = useState('')
  const [connectPending, setConnectPending] = useState(false)

  const handleSync = async (connectPrivate = false) => {
    setIsSyncing(true)
    setSyncMessage('')
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        ...(connectPrivate
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectPrivate: true }) }
          : {}),
      })
      const data = await res.json()
      if (res.ok) {
        const incomplete = data.enrichmentComplete === false
          ? ' Manifest enrichment timed out; sync again to finish it.'
          : data.enrichmentFailures > 0
            ? ` ${data.enrichmentFailures} ${data.enrichmentFailures === 1 ? 'repository' : 'repositories'} synced without manifest evidence.`
            : ''
        setSyncMessage(`Synced ${data.syncedCount} projects.${incomplete}`)
        router.refresh()
      } else {
        setSyncMessage(clientErrorMessage(res, data, 'Unable to sync projects. Please try again.'))
      }
    } catch {
      setSyncMessage('Unable to sync projects. Please try again.')
    } finally {
      setIsSyncing(false)
    }
  }

  // Resuming a sync after the OAuth round-trip makes the re-authorization
  // visible: private repositories are imported and the banner clears.
  const resumePrivateSync = useEffectEvent(() => handleSync(true))
  useEffect(() => {
    if (sessionStorage.getItem(CONNECT_PRIVATE_PENDING)) {
      sessionStorage.removeItem(CONNECT_PRIVATE_PENDING)
      queueMicrotask(() => void resumePrivateSync())
    }
  }, [])

  // Upgrades the GitHub grant from public_repo to repo so private
  // repositories can be imported; the user returns to the dashboard.
  const handleConnectPrivate = async () => {
    setConnectMessage('')
    setConnectPending(true)
    try {
      sessionStorage.setItem(CONNECT_PRIVATE_PENDING, '1')
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          // Must match an allow-listed redirect URL exactly, like the sign-in
          // flow; a stray query string can bounce the whole authorization.
          redirectTo: `${location.origin}/auth/callback`,
          scopes: 'repo read:user user:email'
        },
      })
      if (error) throw error
    } catch {
      sessionStorage.removeItem(CONNECT_PRIVATE_PENDING)
      setConnectPending(false)
      setConnectMessage('Unable to start GitHub authorization. Please try again.')
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const filteredAndSorted = useMemo(() => {
    const result = projects.filter(p =>
      (repositoryVisibility === 'all' || (repositoryVisibility === 'private' ? p.is_private : !p.is_private)) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (p.technologies || []).some(t => t.toLowerCase().includes(search.toLowerCase())))
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
  }, [projects, repositoryVisibility, search, sort])

  return (
    <div className="min-h-screen font-sans">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo className="h-6 w-6 text-brand" />
            <h1 className="label font-bold tracking-[0.3em]">Proofstack</h1>
          </div>

          {user && (
            <div className="flex items-center gap-3">
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
                <span className="hidden font-mono text-[11px] text-dim sm:inline">
                  {user.handle ? `@${user.handle}` : user.displayName}
                </span>
              )}
              <Link
                href="/account"
                aria-label="Account settings"
                className="p-1 text-dim transition-colors hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <button
                onClick={handleSignOut}
                aria-label="Sign out"
                className="p-1 text-dim transition-colors hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <PortfolioBriefingPanel projectCount={projects.length} initial={initialBriefing} />

        <section id="projects" aria-labelledby="projects-heading" className="mt-6 scroll-mt-20 border-b border-line pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h2 id="projects-heading" className="label text-foreground">Projects</h2>
              <span className="font-mono text-[11px] text-dim">
                {filteredAndSorted.length === projects.length
                  ? projects.length
                  : `${filteredAndSorted.length} / ${projects.length}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {lastSyncedAt && (
                <span className="hidden whitespace-nowrap font-mono text-[10px] text-dim sm:inline">Synced {isoDate(lastSyncedAt)}</span>
              )}
              <Button
                onClick={() => handleSync()}
                disabled={isSyncing}
                variant="outline"
                size="sm"
                aria-label="Sync GitHub"
                className="eyebrow"
              >
                <RefreshCw className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Syncing' : 'Sync'}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-mono text-xs text-brand">
                &gt;
              </span>
              <input
                type="text"
                aria-label="Search projects and technologies"
                placeholder="Search projects and technologies"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="field bg-surface py-2 pl-8 pr-3"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {privateReposConnected && (
                <div role="group" aria-label="Filter repositories by visibility" className="flex divide-x divide-line border border-line">
                  {(['all', 'public', 'private'] as const).map(visibility => (
                    <button
                      key={visibility}
                      aria-pressed={repositoryVisibility === visibility}
                      onClick={() => setRepositoryVisibility(visibility)}
                      className={`eyebrow flex-1 px-3 py-2 transition-colors sm:flex-none ${
                        repositoryVisibility === visibility ? 'bg-raised text-brand' : 'text-dim hover:text-foreground'
                      }`}
                    >
                      {visibility[0].toUpperCase() + visibility.slice(1)}
                    </button>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-2">
                <span className="eyebrow shrink-0 text-dim">Sort</span>
                <select
                  aria-label="Sort projects"
                  value={sort}
                  onChange={event => setSort(event.target.value as typeof sort)}
                  className="field min-w-44 bg-surface px-3 py-2 font-sans text-sm"
                >
                  {SORTS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {syncMessage && (
            <p role="status" className="mt-2 font-mono text-[11px] text-dim">{syncMessage}</p>
          )}

          {!privateReposConnected && (
            <div className="mt-3 flex flex-col gap-2 border-l border-brand-dim pl-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[11px] text-dim">
                Private repositories are not imported. Grant read access to include them in your private workspace.
              </p>
              <div className="flex items-center gap-3">
                {connectMessage && <span role="status" className="font-mono text-[11px] text-dim">{connectMessage}</span>}
                <Button variant="outline" size="sm" onClick={handleConnectPrivate} disabled={connectPending} className="eyebrow shrink-0">
                  <Lock className="h-3.5 w-3.5" /> {connectPending ? 'Redirecting to GitHub' : 'Include private repositories'}
                </Button>
              </div>
            </div>
          )}
        </section>

        {loadError && (
          <div role="alert" className="mt-6 border border-line bg-surface px-6 py-5">
            <p className="text-sm text-dim">
              Your projects could not be loaded. Your data is safe; this is a read failure, not an empty portfolio.
            </p>
            <Button variant="outline" onClick={() => router.refresh()} className="eyebrow mt-4">
              <RefreshCw /> Retry
            </Button>
          </div>
        )}

        {/* Project cards */}
        {!loadError && <section className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredAndSorted.map((project, i) => (
            <article
              key={project.id}
              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
              className="corner-ticks group relative flex animate-rise flex-col border border-line bg-surface transition-colors hover:border-line-bright"
            >
              <span className="absolute inset-y-3 left-0 w-px bg-brand opacity-0 transition-opacity group-hover:opacity-100" />

              <div className="flex items-center justify-between px-5 pt-4">
                <div className="flex items-center gap-3">
                  {project.language ? (
                    <span className="eyebrow flex items-center gap-1.5 whitespace-nowrap text-dim">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: languageColor(project.language) }}
                      />
                      {project.language}
                    </span>
                  ) : <span />}
                  {project.is_private && (
                    <span className="eyebrow flex items-center gap-1 text-dim">
                      <Lock className="h-3 w-3" /> Private
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={project.html_url}
                    aria-label={`View ${project.name} on GitHub (opens in new tab)`}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-10 p-1 text-dim transition-colors hover:text-foreground"
                  >
                    <GithubIcon className="h-3.5 w-3.5" />
                  </a>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-dim">
                    <Star className="h-3 w-3 text-amber-300/80" />
                    {project.stargazers_count}
                  </span>
                </div>
              </div>

              <div className="flex flex-grow flex-col px-5 pb-5 pt-2">
                {/* The stretched pseudo-element makes the card clickable down to
                    the footer, which stays uncovered so technology tooltips and
                    the GitHub link remain hoverable. */}
                <Link
                  href={`/project/${project.id}`}
                  className="text-lg font-semibold tracking-tight transition-colors after:absolute after:inset-x-0 after:top-0 after:bottom-14 hover:text-brand"
                >
                  {project.name}
                </Link>
                <p className={`mt-2 text-sm leading-relaxed ${project.description ? 'text-dim' : 'italic text-dim'}`}>
                  {project.description || 'No description on GitHub.'}
                </p>
                {project.brief?.purpose && (
                  <p className="mt-2 flex-grow text-sm leading-relaxed text-foreground/90">
                    <span className="eyebrow mr-2 text-brand">Owner notes</span>
                    {project.brief.purpose}
                  </p>
                )}
                {!project.brief?.purpose && <span className="flex-grow" />}
                {project.brief?.lifecycle_status && (
                  <span className="eyebrow mt-3 inline-block self-start border border-line px-2 py-0.5 text-dim">
                    {LIFECYCLE_LABELS[project.brief.lifecycle_status]}
                  </span>
                )}
              </div>

              <footer className="mt-auto flex items-center justify-between gap-3 border-t border-line px-5 py-3">
                {/* Technology metadata is a single labeled group: readable by
                    screen readers without five icon-only focus stops. */}
                <span aria-label={`Technologies: ${stackTechnologies(project).slice(0, 5).join(', ')}`} className="relative z-10 flex min-w-0 items-center gap-2">
                  {stackTechnologies(project).slice(0, 5).map(tech => {
                    const iconClass = deviconFor(tech)
                    const brand = techBrandMark(tech)
                    return iconClass ? (
                      <i key={tech} aria-hidden="true" title={tech} className={`${iconClass} text-base text-faint transition-colors hover:text-dim`} />
                    ) : brand ? (
                      <TechBrandIcon key={tech} technology={tech} aria-hidden="true" title={tech} className="h-4 w-4 text-faint transition-colors hover:text-dim" />
                    ) : (
                      <span
                        key={tech}
                        aria-hidden="true"
                        title={tech}
                        className="font-mono text-[9px] tracking-wider"
                        style={{ color: languageColor(tech) }}
                      >
                        {tech.substring(0, 2).toUpperCase()}
                      </span>
                    )
                  })}
                </span>
                <span className="whitespace-nowrap font-mono text-[10px] text-dim">
                  {isoDate(project.pushed_at || project.updated_at) ?? '----.--.--'}
                </span>
              </footer>
            </article>
          ))}

          {filteredAndSorted.length === 0 && (
            <div className="corner-ticks relative col-span-full flex flex-col items-center justify-center border border-dashed border-line py-20 text-center">
              <h3 className="text-lg font-semibold">No projects found</h3>
              <p className="mt-1 max-w-md text-sm text-dim">
                {projects.length === 0
                  ? 'Sync your GitHub account to import your repositories.'
                  : 'No repositories match your search.'}
              </p>
              {projects.length === 0 && (
                <Button onClick={() => handleSync()} disabled={isSyncing} className="eyebrow mt-6">
                  <RefreshCw className={isSyncing ? 'animate-spin' : ''} /> Sync GitHub
                </Button>
              )}
            </div>
          )}
        </section>}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="eyebrow text-dim">Proofstack v{packageJson.version}</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="eyebrow text-dim transition-colors hover:text-foreground">Privacy</Link>
            <a
              href="https://github.com/jrudman25/Repfolio"
              target="_blank"
              rel="noreferrer"
              aria-label="View the Proofstack source on GitHub (opens in new tab)"
              className="eyebrow flex items-center gap-1.5 text-dim transition-colors hover:text-foreground"
            >
              <GithubIcon className="h-3.5 w-3.5" /> Source
            </a>
          </div>
        </div>
      </footer>

      <ChatWidget />
    </div>
  )
}
