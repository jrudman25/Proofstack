import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PortfolioBriefingPanel from './PortfolioBriefingPanel'
import type { PortfolioBriefing } from '@/types'

const briefing: PortfolioBriefing = {
  summary: 'A portfolio focused on web engineering.',
  themes: [{ title: 'Web engineering', detail: 'Uses typed application stacks.', projectIds: ['p1'] }],
  spotlights: [{ projectId: 'p1', reason: 'Shows system design.', talkingPoints: ['Explain the architecture.'] }],
  growth: 'The projects show increasing scope.',
  evidenceGaps: ['Add measurable outcomes.'],
  interviewQuestions: ['Why did you choose this architecture?'],
  citations: [{ projectId: 'p1', name: 'Example', url: 'https://github.com/owner/Example', evidence: ['github', 'owner'] }],
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
  expect(screen.getByRole('button', { name: 'Regenerate briefing' })).toBeInTheDocument()
})

it('shows a persisted briefing with its generated date and changed-repository count', () => {
  render(<PortfolioBriefingPanel projectCount={2}
    initial={{ briefing, generatedAt: '2026-09-10T00:00:00.000Z', changedCount: 1 }} />)
  expect(screen.getByText(briefing.summary)).toBeInTheDocument()
  expect(screen.getByText(/AI-generated 2026-09-10/)).toBeInTheDocument()
  expect(screen.getByText(/1 repository changed since/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Regenerate briefing' })).toBeInTheDocument()
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
