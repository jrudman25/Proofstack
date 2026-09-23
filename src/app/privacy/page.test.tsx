import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PrivacyPage from './page'

const io = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: io.getUser } }),
}))

beforeEach(() => {
  io.getUser.mockResolvedValue({ data: { user: null }, error: null })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('renders the heading, header navigation, and external repository link', async () => {
  render(await PrivacyPage())
  expect(screen.getByRole('heading', { name: 'Privacy and data use' })).toBeInTheDocument()

  const nav = screen.getByRole('navigation', { name: 'Privacy navigation' })
  expect(within(nav).getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help')
  expect(within(nav).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  expect(screen.queryByRole('link', { name: 'Back to sign in' })).not.toBeInTheDocument()

  const repo = screen.getByRole('link', { name: /GitHub repository/ })
  expect(repo).toHaveAttribute('href', 'https://github.com/jrudman25/Repfolio')
  expect(repo).toHaveAttribute('target', '_blank')
  expect(repo).toHaveAttribute('rel', 'noreferrer')
})

it('links signed-in visitors back to the dashboard instead of sign-in', async () => {
  io.getUser.mockResolvedValue({ data: { user: { id: 'alice' } }, error: null })
  render(await PrivacyPage())
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
})
