import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import LoginPage from './page'

const io = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }))
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: io.signInWithOAuth } }),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('presents the value statement, OAuth action, and a truthful illustrative preview', () => {
  render(<LoginPage />)
  expect(screen.getByRole('heading', { name: 'Know your own work before the interview' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Sign in with GitHub/ })).toBeEnabled()

  expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  expect(screen.getByText('Sync repositories')).toBeInTheDocument()
  expect(screen.getByText('Add your context')).toBeInTheDocument()
  expect(screen.getByText('Prepare a briefing')).toBeInTheDocument()

  expect(screen.getByRole('heading', { name: 'Illustrative briefing preview' })).toBeInTheDocument()
  expect(screen.getByText(/not an analysis of you/)).toBeInTheDocument()
  expect(screen.getByText('Portfolio theme')).toBeInTheDocument()
  expect(screen.getByText('Project spotlight')).toBeInTheDocument()
  expect(screen.getByText('Practice question')).toBeInTheDocument()
})

it('requests read-only GitHub scopes through the allow-listed callback', async () => {
  io.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: /Sign in with GitHub/ }))
  await waitFor(() => expect(io.signInWithOAuth).toHaveBeenCalledOnce())
  expect(io.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'github',
    options: {
      redirectTo: `${location.origin}/auth/callback`,
      scopes: 'public_repo read:user user:email',
    },
  })
})

it('shows the redirect pending state while OAuth is in flight', async () => {
  io.signInWithOAuth.mockReturnValue(new Promise(() => {}))
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: /Sign in with GitHub/ }))
  const button = await screen.findByRole('button', { name: /Redirecting to GitHub/ })
  expect(button).toBeDisabled()
})

it('reports a recoverable error when GitHub authorization cannot start', async () => {
  io.signInWithOAuth.mockResolvedValue({ data: {}, error: new Error('provider down') })
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: /Sign in with GitHub/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to start GitHub sign-in. Please try again.')
  expect(screen.getByRole('button', { name: /Sign in with GitHub/ })).toBeEnabled()
})
