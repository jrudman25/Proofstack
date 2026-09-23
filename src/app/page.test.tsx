import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Home from './page'

const io = vi.hoisted(() => ({
  getUser: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: vi.fn(), signOut: vi.fn() } }),
}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: io.getUser },
    from: (table: string) => {
      const result = () => Promise.resolve(io.tables[table])
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: result,
        maybeSingle: result,
      }
      return builder
    },
  }),
}))

const projectRow = {
  id: 'p1', name: 'Example', full_name: 'owner/Example', description: 'Example repository',
  html_url: 'https://github.com/owner/Example', language: 'TypeScript', homepage: null,
  stargazers_count: 1, pushed_at: null, github_created_at: '2025-01-01T00:00:00.000Z',
  is_private: false, ai_opt_in: false, technologies: [],
  created_at: '2026-01-01', updated_at: '2026-03-04T10:00:00.000Z',
  project_briefs: null,
}

beforeEach(() => {
  io.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'me@example.com', user_metadata: {} } }, error: null })
  io.tables = {
    projects: { data: [projectRow], error: null },
    profiles: { data: { last_catalog_sync_at: '2026-03-04T10:00:00.000Z', github_private_scope: false }, error: null },
    portfolio_briefings: { data: null, error: null },
  }
})

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })

it('shows a reloadable alert and hides sync-dependent controls when the profile read fails', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  io.tables.profiles = { data: null, error: { message: 'read failed' } }
  render(await Home())
  expect(screen.getByRole('alert')).toHaveTextContent('Sync status could not be loaded.')
  expect(screen.queryByText(/Private repositories are not imported/)).not.toBeInTheDocument()
  expect(screen.queryByText('Synced 2026-03-04')).not.toBeInTheDocument()
  expect(consoleError).toHaveBeenCalledWith('Error fetching profile')
  expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('read failed'))
})

it('disables briefing generation and shows an alert when the briefing read fails', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  io.tables.portfolio_briefings = { data: null, error: { message: 'read failed' } }
  render(await Home())
  expect(screen.getByRole('alert')).toHaveTextContent('Your saved briefing could not be loaded.')
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeDisabled()
  expect(consoleError).toHaveBeenCalledWith('Error fetching briefing')
})

it('renders the dashboard normally when every read succeeds', async () => {
  render(await Home())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Synced 2026-03-04')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Include private repositories/ })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeEnabled()
})
