import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import type { DashboardProject } from '@/types'

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
  created_at: '2026-01-01', updated_at: '2026-03-04T10:00:00.000Z',
  brief: null,
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); io.signInWithOAuth.mockClear(); sessionStorage.clear() })

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

it('keeps the briefing as the only primary action and disables it without projects', () => {
  render(<Dashboard initialProjects={[]} />)
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeDisabled()
  expect(screen.getAllByRole('button', { name: 'Sync GitHub' }).length).toBeGreaterThan(0)
  expect(screen.getByText(/Sync your GitHub account/)).toBeInTheDocument()
})

it('reflects refreshed server projects and briefing eligibility without losing search', () => {
  const { rerender } = render(<Dashboard initialProjects={[]} />)
  expect(screen.getByText(/Sync your GitHub account/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search projects and technologies' }), { target: { value: 'Example' } })
  rerender(<Dashboard initialProjects={[project]} lastSyncedAt="2026-03-04T10:00:00.000Z" />)
  expect(screen.getByRole('link', { name: 'Example' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeEnabled()
  expect(screen.getByText('Synced 2026-03-04')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Search projects and technologies' })).toHaveValue('Example')
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
