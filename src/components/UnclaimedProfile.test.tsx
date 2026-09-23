import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import UnclaimedProfile from './UnclaimedProfile'
import type { UnclaimedAnalysis } from '@/types'

const io = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: io.replace }) }))

const props = {
  username: 'octocat',
  initialAnalysis: null,
}

const analysis: UnclaimedAnalysis = {
  username: 'octocat',
  summary: 'Builds TypeScript tools.',
  focusAreas: ['TypeScript'],
  notableProjects: [{ name: 'repolio', url: 'https://github.com/octocat/repolio', reason: 'Flagship project' }],
  generatedAt: '2026-09-21T00:00:00.000Z',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

it('labels the preview as automated and unclaimed with a generate action', () => {
  render(<UnclaimedProfile {...props} />)
  expect(screen.getByRole('heading', { name: 'octocat' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Automated preview' })).toBeInTheDocument()
  expect(screen.getByText(/Unclaimed profile/)).toBeInTheDocument()
  expect(screen.getByText(/has not published a Proofstack profile/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /@octocat/ })).toHaveAttribute('href', 'https://github.com/octocat')
  expect(screen.getByRole('link', { name: 'Sign in to claim your profile' })).toHaveAttribute('href', '/login')
  expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help')
})

it('generates and renders an analysis on demand', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', analysis }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<UnclaimedProfile {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate automated analysis' }))
  expect(await screen.findByText('Builds TypeScript tools.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'repolio' })).toHaveAttribute('href', 'https://github.com/octocat/repolio')
  expect(screen.getByText('TypeScript')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/public-analysis', expect.objectContaining({
    body: JSON.stringify({ username: 'octocat' }),
  }))
})

it('renders a previously cached analysis without a generate action', () => {
  render(<UnclaimedProfile {...props} initialAnalysis={analysis} />)
  expect(screen.getByText('Builds TypeScript tools.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Generate automated analysis' })).not.toBeInTheDocument()
})

it('redirects to the canonical profile when the user has since claimed one', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'claimed', slug: 'octo' }) }))
  render(<UnclaimedProfile {...props} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Generate automated analysis' })) })
  expect(io.replace).toHaveBeenCalledWith('/u/octo')
})

it('shows a sanitized error when generation is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'No automated analysis is available for this GitHub user' }) }))
  render(<UnclaimedProfile {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate automated analysis' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No automated analysis is available for this GitHub user')
})
