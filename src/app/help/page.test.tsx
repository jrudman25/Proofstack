import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import HelpPage from './page'

const io = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: io.getUser } }),
}))

beforeEach(() => {
  io.getUser.mockResolvedValue({ data: { user: null }, error: null })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('renders the page heading, all four section headings, and header links', async () => {
  render(await HelpPage())
  expect(screen.getByRole('heading', { name: 'Help and frequently asked questions' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Data and AI' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Public profiles' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Troubleshooting and account controls' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
})

it('answers private repository, publication, and deletion questions', async () => {
  render(await HelpPage())
  expect(screen.getByRole('heading', { name: 'How are private repositories handled?' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'What becomes public when I publish?' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'How do I delete my data?' })).toBeInTheDocument()
})

it('links signed-in visitors back to the dashboard instead of sign-in', async () => {
  io.getUser.mockResolvedValue({ data: { user: { id: 'alice' } }, error: null })
  render(await HelpPage())
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
})
