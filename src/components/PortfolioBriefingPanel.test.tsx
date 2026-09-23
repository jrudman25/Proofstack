import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PortfolioBriefingPanel from './PortfolioBriefingPanel'
import type { PortfolioBriefing } from '@/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const briefing: PortfolioBriefing = {
  summary: 'A portfolio focused on web engineering.',
  themes: [{ title: 'Web engineering', detail: 'Uses typed application stacks.', projectIds: ['p1'] }],
  spotlights: [{ projectId: 'p1', reason: 'Shows system design.', talkingPoints: ['Explain the architecture.'] }],
  growth: 'The projects show increasing scope.',
  evidenceGaps: ['Add measurable outcomes.'],
  interviewQuestions: ['Why did you choose this architecture?'],
  citations: [{ projectId: 'p1', name: 'Example', url: 'https://github.com/owner/Example', evidence: ['github', 'owner'] }],
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear() })

it('generates and presents a briefing with provenance labels and internal project links', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ briefing, generatedAt: '2026-09-14T00:00:00.000Z' }) }))
  render(<PortfolioBriefingPanel projectCount={1} />)
  fireEvent.click(screen.getByRole('button', { name: 'Prepare briefing' }))
  expect(await screen.findByText(briefing.summary)).toBeInTheDocument()
  // Spotlights and themes link into the internal project workspace; the
  // GitHub link is auxiliary navigation, not evidence.
  const internal = screen.getAllByRole('link', { name: 'Example' })
  expect(internal).toHaveLength(2)
  expect(internal.every(link => link.getAttribute('href') === '/project/p1')).toBe(true)
  expect(screen.getAllByRole('link', { name: 'View Example on GitHub (opens in new tab)' })).toHaveLength(2)
  expect(screen.getByText('GitHub metadata + Owner notes')).toBeInTheDocument()
  expect(screen.getByText(/AI-generated 2026-09-14/)).toBeInTheDocument()
  expect(screen.getByText('Add measurable outcomes.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
})

it('notifies the parent after a successful generation but not after a failure', async () => {
  const onGenerated = vi.fn()
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ briefing, generatedAt: '2026-09-21T00:00:00.000Z' }) })
    .mockRejectedValueOnce(new Error('down')))
  render(<PortfolioBriefingPanel projectCount={1} onGenerated={onGenerated} />)
  fireEvent.click(screen.getByRole('button', { name: 'Prepare briefing' }))
  expect(await screen.findByText(briefing.summary)).toBeInTheDocument()
  expect(onGenerated).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
  fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Unable to generate your briefing. Please try again.')
  expect(onGenerated).toHaveBeenCalledOnce()
})

it('confirms before replacing an existing briefing', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ briefing, generatedAt: '2026-09-21T00:00:00.000Z' }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<PortfolioBriefingPanel projectCount={1}
    initial={{ briefing, generatedAt: '2026-09-10T00:00:00.000Z', changedCount: 0 }} />)

  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
  expect(screen.getByText('Replace current briefing?')).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByText('Replace current briefing?')).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
  fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolio-briefing', { method: 'POST' }))
})

it('anchors the briefing section for onboarding deep links', () => {
  const { container } = render(<PortfolioBriefingPanel projectCount={1} />)
  expect(container.querySelector('#interview-briefing')).not.toBeNull()
})

it('renders a persisted briefing expanded with practice questions and collapses on request', () => {
  render(<PortfolioBriefingPanel projectCount={2}
    initial={{ briefing, generatedAt: '2026-09-10T00:00:00.000Z', changedCount: 1 }} />)
  expect(screen.getByText(briefing.summary)).toBeInTheDocument()
  const question = screen.getByText('Why did you choose this architecture?')
  expect(question.closest('details')).toBeNull()
  expect(screen.getByText('Recurring themes').closest('details')).not.toBeNull()
  expect(screen.getByText(/AI-generated 2026-09-10/)).toBeInTheDocument()
  expect(screen.getByText(/1 repository changed/)).toBeInTheDocument()
  const toggle = screen.getByRole('button', { name: 'Hide briefing' })
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(toggle)
  expect(screen.queryByText(briefing.summary)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Show briefing' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
})

it('disables generation and offers a reload when the stored briefing failed to load', () => {
  render(<PortfolioBriefingPanel projectCount={1} loadFailed />)
  expect(screen.getByRole('alert')).toHaveTextContent('Your saved briefing could not be loaded.')
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
  expect(refresh).toHaveBeenCalledOnce()
})

it('disables generation and explains the prerequisite when no projects are synced', () => {
  render(<PortfolioBriefingPanel projectCount={0} />)
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeDisabled()
  expect(screen.getByText(/Sync GitHub first/)).toBeInTheDocument()
})

it('shows sanitized client-side API messages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Sync GitHub projects before generating a briefing' }) }))
  render(<PortfolioBriefingPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Prepare briefing' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Sync GitHub projects before generating a briefing')
})

it.each(['response', 'network'])('sanitizes briefing %s failures', async failure => {
  vi.stubGlobal('fetch', failure === 'network'
    ? vi.fn().mockRejectedValue(new Error('private details'))
    : vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'private details' }) }))
  render(<PortfolioBriefingPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Prepare briefing' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Unable to generate your briefing. Please try again.')
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument()
})
