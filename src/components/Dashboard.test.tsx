import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import type { DashboardProject, PortfolioBriefing } from '@/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const io = vi.hoisted(() => ({
  signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
  signOut: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: io.signInWithOAuth, signOut: io.signOut } }),
}))

const project: DashboardProject = {
  id: 'p1', name: 'Example', full_name: 'owner/Example',
  description: 'Example repository', html_url: 'https://github.com/owner/Example', language: 'TypeScript',
  homepage: null, stargazers_count: 1, pushed_at: null, technologies: ['MongoDB', 'Next.js'],
  is_private: false, ai_opt_in: false, github_created_at: '2025-01-01T00:00:00.000Z',
  github_fork: false, github_owner_login: 'owner', github_owner_type: 'User',
  created_at: '2026-01-01', updated_at: '2026-03-04T10:00:00.000Z',
  brief: null,
}

const briefing: PortfolioBriefing = {
  summary: 'A portfolio focused on web engineering.',
  themes: [{ title: 'Web engineering', detail: 'Uses typed application stacks.', projectIds: ['p1'] }],
  spotlights: [{ projectId: 'p1', reason: 'Shows system design.', talkingPoints: ['Explain the architecture.'] }],
  growth: 'The projects show increasing scope.',
  evidenceGaps: ['Add measurable outcomes.'],
  interviewQuestions: ['Why did you choose this architecture?'],
  citations: [{ projectId: 'p1', name: 'Example', url: 'https://github.com/owner/Example', evidence: ['github'] }],
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); io.signInWithOAuth.mockClear(); sessionStorage.clear(); localStorage.clear() })

it('names search and GitHub links and exposes selected sorting', () => {
  render(<Dashboard initialProjects={[project]} />)
  const link = screen.getByRole('link', { name: 'View Example on GitHub (opens in new tab)' })
  expect(link).toHaveAttribute('href', project.html_url)
  link.focus()
  expect(link).toHaveFocus()
  expect(screen.getByRole('combobox', { name: 'Sort projects' })).toHaveValue('updated')
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort projects' }), { target: { value: 'name' } })
  expect(screen.getByRole('combobox', { name: 'Sort projects' })).toHaveValue('name')
  fireEvent.change(screen.getByRole('textbox', { name: 'Search projects and technologies' }), { target: { value: 'missing' } })
  expect(screen.getByText('No projects found')).toBeInTheDocument()
})

it('shows GitHub facts and names the technology icon group', () => {
  const { container } = render(<Dashboard initialProjects={[project]} />)
  expect(screen.getByText('Example repository')).toBeInTheDocument()
  expect(container.querySelector('i.devicon-mongodb-plain')).not.toBeNull()
  expect(container.querySelector('i.devicon-nextjs-original')).not.toBeNull()
  expect(container.querySelector('[aria-label="Technologies: TypeScript, MongoDB, Next.js"]')).not.toBeNull()
})

it('shows the primary language as labeled metadata and a stack icon when no technologies were generated', () => {
  const { container } = render(<Dashboard initialProjects={[{ ...project, technologies: [] }]} />)
  expect(screen.getByText('TypeScript')).toBeInTheDocument()
  expect(container.querySelector('i.devicon-typescript-plain')).not.toBeNull()
})

it('does not duplicate the primary language in the stack icons', () => {
  const { container } = render(<Dashboard initialProjects={[{ ...project, technologies: ['typescript', 'React'] }]} />)
  expect(container.querySelectorAll('i.devicon-typescript-plain')).toHaveLength(1)
  expect(container.querySelector('i.devicon-react-original')).not.toBeNull()
})

it('uses bundled logos for detected frontend technologies', () => {
  const { container } = render(<Dashboard initialProjects={[{ ...project, technologies: ['Vite', 'Material UI'] }]} />)
  expect(container.querySelector('i.devicon-vitejs-plain')).not.toBeNull()
  expect(container.querySelector('i.devicon-materialui-plain')).not.toBeNull()
})

it('shows bundled logos for non-JavaScript languages and manifest tools', () => {
  const { container } = render(<Dashboard initialProjects={[{ ...project, language: 'Java', technologies: ['Gradle', 'C++', 'C#'] }]} />)
  expect(container.querySelector('i.devicon-java-plain')).not.toBeNull()
  expect(container.querySelector('i.devicon-gradle-original')).not.toBeNull()
  expect(container.querySelector('i.devicon-cplusplus-plain')).not.toBeNull()
  expect(container.querySelector('i.devicon-csharp-plain')).not.toBeNull()
})

it('marks private repositories and shows owner brief context on cards', () => {
  render(<Dashboard initialProjects={[{
    ...project, is_private: true,
    brief: { purpose: 'Interview prep notes', lifecycle_status: 'active', owner_verified_at: null },
  }]} />)
  expect(screen.getByText('Private', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByText('Owner notes')).toBeInTheDocument()
  expect(screen.getByText('Interview prep notes')).toBeInTheDocument()
  expect(screen.getByText('Active')).toBeInTheDocument()
})

it('shows the last completed catalog sync and the private-repository connection prompt', () => {
  render(<Dashboard initialProjects={[project]} lastSyncedAt="2026-03-04T10:00:00.000Z" privateReposConnected={false} />)
  expect(screen.getByText('Synced 2026-03-04')).toBeInTheDocument()
  expect(screen.getByText(/Private repositories are not imported/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Include private repositories/ })).toBeInTheDocument()
})

it('renders bundled brand marks for technologies without devicon glyphs', () => {
  const { container } = render(<Dashboard initialProjects={[{ ...project, language: null, technologies: ['TanStack', 'Upstash', 'Neon', 'Gemini', 'HeroUI'] }]} />)
  for (const tech of ['TanStack', 'Upstash', 'Neon', 'Gemini', 'HeroUI']) {
    expect(container.querySelector(`svg[title="${tech}"]`)).not.toBeNull()
  }
})

it('requests the repo scope through the same allow-listed callback path as sign-in', async () => {
  render(<Dashboard initialProjects={[project]} privateReposConnected={false} />)
  fireEvent.click(screen.getByRole('button', { name: /Include private repositories/ }))
  await waitFor(() => expect(io.signInWithOAuth).toHaveBeenCalledOnce())
  expect(io.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'github',
    options: {
      redirectTo: `${location.origin}/auth/callback`,
      scopes: 'repo read:user user:email',
    },
  })
})

it('syncs automatically when returning from the private-repository authorization', async () => {
  sessionStorage.setItem('proofstack:connect-private', '1')
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ syncedCount: 2 }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<Dashboard initialProjects={[project]} />)
  expect(await screen.findByRole('status')).toHaveTextContent('Synced 2 projects.')
  expect(fetchMock).toHaveBeenCalledWith('/api/sync', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ connectPrivate: true }),
  }))
  expect(sessionStorage.getItem('proofstack:connect-private')).toBeNull()
})

it('filters public and private repositories without removing synced data', () => {
  const privateProject = { ...project, id: 'p2', name: 'Secret', full_name: 'owner/Secret', is_private: true }
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<Dashboard initialProjects={[project, privateProject]} privateReposConnected />)

  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('link', { name: 'Example' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Secret' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Public' }))
  expect(screen.getByRole('link', { name: 'Example' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Secret' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Private' }))
  expect(screen.queryByRole('link', { name: 'Example' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Secret' })).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('does not sync automatically without a pending private-repository authorization', () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<Dashboard initialProjects={[project]} />)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('gives an empty portfolio one guided first-run action', () => {
  render(<Dashboard initialProjects={[]} />)
  expect(screen.getByRole('heading', { name: 'Build your first interview briefing' })).toBeInTheDocument()
  expect(screen.getByText('Sync repositories')).toBeInTheDocument()
  expect(screen.getByText('Add your context')).toBeInTheDocument()
  expect(screen.getByText('Prepare a briefing')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Import from GitHub' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Prepare briefing' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Search projects and technologies' })).not.toBeInTheDocument()
})

it('replaces the first-run panel with a getting started checklist after repositories are imported', () => {
  const { rerender } = render(<Dashboard initialProjects={[]} />)
  expect(screen.getByRole('heading', { name: 'Build your first interview briefing' })).toBeInTheDocument()
  rerender(<Dashboard initialProjects={[project]} lastSyncedAt="2026-03-04T10:00:00.000Z" />)
  expect(screen.queryByRole('heading', { name: 'Build your first interview briefing' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Example' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeEnabled()
  expect(screen.getByText('Synced 2026-03-04')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Search projects and technologies' })).toBeInTheDocument()
})

const checklist = () => within(screen.getByRole('region', { name: 'Getting started' }))

it('shows sync as done and links the remaining checklist steps', () => {
  render(<Dashboard initialProjects={[project]} />)
  const steps = checklist().getAllByRole('listitem')
  expect(steps).toHaveLength(3)
  expect(steps[0]).toHaveTextContent('Sync repositories')
  expect(steps[0]).toHaveTextContent('Done')
  expect(steps[1]).toHaveTextContent('Add project context')
  expect(steps[1]).not.toHaveTextContent('Done')
  expect(within(steps[1]).getByRole('link', { name: 'Open a project' })).toHaveAttribute('href', '/project/p1')
  expect(steps[2]).toHaveTextContent('Prepare a briefing')
  expect(steps[2]).not.toHaveTextContent('Done')
  expect(within(steps[2]).getByRole('link', { name: 'Go to briefing' })).toHaveAttribute('href', '#interview-briefing')
})

it('marks the context step done when a project already has a brief', () => {
  render(<Dashboard initialProjects={[{ ...project, brief: { purpose: 'Notes', lifecycle_status: null, owner_verified_at: null } }]} />)
  expect(checklist().getAllByRole('listitem')[1]).toHaveTextContent('Done')
})

it('marks the context step done after a project card is opened and persists it', () => {
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('link', { name: 'Example' }))
  expect(localStorage.getItem('proofstack:onboarding-project-opened')).toBe('1')
  expect(checklist().getAllByRole('listitem')[1]).toHaveTextContent('Done')
})

it('marks the briefing step done when a briefing exists and after generating one', async () => {
  const { unmount } = render(<Dashboard initialProjects={[project]} initialBriefing={{ briefing, generatedAt: '2026-09-10T00:00:00.000Z', changedCount: 0 }} />)
  expect(checklist().getAllByRole('listitem')[2]).toHaveTextContent('Done')
  unmount()

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ briefing, generatedAt: '2026-09-21T00:00:00.000Z' }) }))
  render(<Dashboard initialProjects={[project]} />)
  expect(checklist().getAllByRole('listitem')[2]).not.toHaveTextContent('Done')
  fireEvent.click(screen.getByRole('button', { name: 'Prepare briefing' }))
  expect(await screen.findByText(briefing.summary)).toBeInTheDocument()
  expect(checklist().getAllByRole('listitem')[2]).toHaveTextContent('Done')
})

it('dismisses the checklist at any stage and keeps it dismissed', () => {
  const { rerender } = render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting started' }))
  expect(localStorage.getItem('proofstack:onboarding-dismissed')).toBe('1')
  expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument()
  rerender(<Dashboard initialProjects={[project]} />)
  expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument()
})

it('honors stored onboarding flags and never shows a checklist on load failure', () => {
  localStorage.setItem('proofstack:onboarding-dismissed', '1')
  localStorage.setItem('proofstack:onboarding-project-opened', '1')
  const { unmount } = render(<Dashboard initialProjects={[project]} />)
  expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument()
  unmount()
  localStorage.clear()
  render(<Dashboard initialProjects={[]} loadError />)
  expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Build your first interview briefing' })).not.toBeInTheDocument()
})

it('gives the header account and sign-out controls 40px targets with labeled names', () => {
  render(<Dashboard initialProjects={[project]} user={{ handle: 'octocat', displayName: null, avatarUrl: null }} />)
  const account = screen.getByRole('link', { name: 'Account' })
  const signOut = screen.getByRole('button', { name: 'Sign out' })
  for (const control of [account, signOut]) {
    expect(control).toHaveClass('h-10')
    expect(control).toHaveClass('w-10')
  }
  expect(within(account).getByText('Account')).toHaveClass('hidden')
  expect(within(signOut).getByText('Sign out')).toHaveClass('hidden')
  signOut.focus()
  expect(signOut).toHaveFocus()
})

it('refreshes server data after a successful sync and reports the count', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ syncedCount: 3 }) }))
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync GitHub' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Synced 3 projects.')
  expect(refresh).toHaveBeenCalledOnce()
})

it('reports partial enrichment results from a successful sync', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ syncedCount: 3, enrichmentFailures: 2 }) }))
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync GitHub' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Synced 3 projects. 2 repositories synced without manifest evidence.')
})

it('shows sanitized client-side sync errors from the API', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Too many requests' }) }))
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync GitHub' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Too many requests')
})

it.each(['response', 'network'])('sanitizes sync %s errors', async failure => {
  vi.stubGlobal('fetch', failure === 'network'
    ? vi.fn().mockRejectedValue(new Error('private details'))
    : vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'private details' }) }))
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync GitHub' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Unable to sync projects. Please try again.')
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument()
})

const thirteenProjects: DashboardProject[] = Array.from({ length: 13 }, (_, i) => ({
  ...project,
  id: `p${i + 1}`,
  name: `Project ${i + 1}`,
  full_name: `owner/Project-${i + 1}`,
  html_url: `https://github.com/owner/Project-${i + 1}`,
  updated_at: `2026-03-${String(25 - i).padStart(2, '0')}T10:00:00.000Z`,
}))

it('paginates the filtered project grid twelve cards per page', () => {
  render(<Dashboard initialProjects={thirteenProjects} />)
  const pages = () => screen.getByRole('navigation', { name: 'Project pages' })

  expect(screen.getByRole('link', { name: 'Project 1' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Project 12' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Project 13' })).not.toBeInTheDocument()
  expect(pages()).toHaveTextContent('Showing 1–12 of 13')
  expect(pages()).toHaveTextContent('Page 1 of 2')
  expect(within(pages()).getByRole('button', { name: 'First' })).toBeDisabled()
  expect(within(pages()).getByRole('button', { name: 'Previous' })).toBeDisabled()
  expect(within(pages()).getByRole('button', { name: 'Next' })).toBeEnabled()
  expect(within(pages()).getByRole('button', { name: 'Last' })).toBeEnabled()

  fireEvent.click(within(pages()).getByRole('button', { name: 'Last' }))
  expect(screen.getByRole('link', { name: 'Project 13' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Project 1' })).not.toBeInTheDocument()
  expect(pages()).toHaveTextContent('Showing 13–13 of 13')
  expect(pages()).toHaveTextContent('Page 2 of 2')
  expect(within(pages()).getByRole('button', { name: 'Next' })).toBeDisabled()
  expect(within(pages()).getByRole('button', { name: 'Last' })).toBeDisabled()

  fireEvent.click(within(pages()).getByRole('button', { name: 'Previous' }))
  expect(pages()).toHaveTextContent('Page 1 of 2')
  expect(screen.getByRole('link', { name: 'Project 1' })).toBeInTheDocument()

  fireEvent.click(within(pages()).getByRole('button', { name: 'Next' }))
  expect(pages()).toHaveTextContent('Page 2 of 2')
  expect(screen.getByRole('link', { name: 'Project 13' })).toBeInTheDocument()

  fireEvent.click(within(pages()).getByRole('button', { name: 'First' }))
  expect(screen.getByRole('link', { name: 'Project 1' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Project 13' })).not.toBeInTheDocument()
  expect(pages()).toHaveTextContent('Page 1 of 2')
  expect(within(pages()).getByRole('button', { name: 'First' })).toBeDisabled()
  expect(within(pages()).getByRole('button', { name: 'Previous' })).toBeDisabled()
})

const twentyFiveProjects: DashboardProject[] = Array.from({ length: 25 }, (_, i) => ({
  ...project,
  id: `p${i + 1}`,
  name: `Project ${i + 1}`,
  full_name: `owner/Project-${i + 1}`,
  html_url: `https://github.com/owner/Project-${i + 1}`,
  updated_at: `2026-03-${String(25 - i).padStart(2, '0')}T10:00:00.000Z`,
}))

it('jumps between the first and last page without stepping through pages', () => {
  render(<Dashboard initialProjects={twentyFiveProjects} />)
  const pages = () => screen.getByRole('navigation', { name: 'Project pages' })

  expect(pages()).toHaveTextContent('Showing 1–12 of 25')
  expect(pages()).toHaveTextContent('Page 1 of 3')

  fireEvent.click(within(pages()).getByRole('button', { name: 'Last' }))
  expect(pages()).toHaveTextContent('Showing 25–25 of 25')
  expect(pages()).toHaveTextContent('Page 3 of 3')
  expect(screen.getByRole('link', { name: 'Project 25' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Project 13' })).not.toBeInTheDocument()
  expect(within(pages()).getByRole('button', { name: 'Next' })).toBeDisabled()
  expect(within(pages()).getByRole('button', { name: 'Last' })).toBeDisabled()

  fireEvent.click(within(pages()).getByRole('button', { name: 'First' }))
  expect(pages()).toHaveTextContent('Showing 1–12 of 25')
  expect(pages()).toHaveTextContent('Page 1 of 3')
  expect(screen.getByRole('link', { name: 'Project 1' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Project 13' })).not.toBeInTheDocument()
  expect(within(pages()).getByRole('button', { name: 'First' })).toBeDisabled()
  expect(within(pages()).getByRole('button', { name: 'Previous' })).toBeDisabled()
})

it('resets to the first page when search, sort, or visibility changes', () => {
  render(<Dashboard initialProjects={thirteenProjects} privateReposConnected />)
  const pages = () => screen.getByRole('navigation', { name: 'Project pages' })

  fireEvent.click(within(pages()).getByRole('button', { name: 'Next' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search projects and technologies' }), { target: { value: 'Project 13' } })
  expect(screen.getByRole('link', { name: 'Project 13' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Project pages' })).not.toBeInTheDocument()

  fireEvent.change(screen.getByRole('textbox', { name: 'Search projects and technologies' }), { target: { value: '' } })
  expect(pages()).toHaveTextContent('Page 1 of 2')

  fireEvent.click(within(pages()).getByRole('button', { name: 'Next' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort projects' }), { target: { value: 'name' } })
  expect(pages()).toHaveTextContent('Page 1 of 2')

  fireEvent.click(within(pages()).getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Private' }))
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(pages()).toHaveTextContent('Page 1 of 2')
})
