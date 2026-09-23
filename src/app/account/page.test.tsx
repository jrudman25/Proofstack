import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AccountPage from './page'

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }))
const io = vi.hoisted(() => ({
  getUser: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => router }))
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: vi.fn().mockResolvedValue({}) } }),
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

const profileRow = {
  public_slug: 'octocat',
  profile_published: false,
  profile_published_at: null,
  public_briefing_published_at: null,
  unclaimed_analysis_opt_out: true,
}
const projectRow = {
  id: 'p1', name: 'Example', is_private: false,
  project_briefs: { visibility: 'public', published_fields: ['purpose'] },
}

beforeEach(() => {
  io.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'me@example.com' } } })
  io.tables = {
    profiles: { data: profileRow, error: null },
    portfolio_briefings: { data: { user_id: 'u1' }, error: null },
    projects: { data: [projectRow], error: null },
  }
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

function expectSettingsLocked() {
  expect(screen.getByRole('alert')).toHaveTextContent('publication settings could not be loaded')
  expect(screen.getByRole('textbox', { name: 'Profile URL slug' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Save URL' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Publish latest briefing' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Publish profile' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Exclude me' })).toBeDisabled()
}

it('locks the publication controls when the profile read fails', async () => {
  io.tables.profiles = { data: null, error: { message: 'read failed' } }
  render(await AccountPage())
  expectSettingsLocked()
})

it('locks the publication controls when the briefing read fails', async () => {
  io.tables.portfolio_briefings = { data: null, error: { message: 'read failed' } }
  render(await AccountPage())
  expectSettingsLocked()
})

it('renders the loaded publication settings when every read succeeds', async () => {
  render(await AccountPage())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Saved: /u/octocat')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Exclude me' })).toBeChecked()
  expect(screen.getByRole('button', { name: 'Publish profile' })).toBeEnabled()
})
