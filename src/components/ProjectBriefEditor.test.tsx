import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ProjectBriefEditor from './ProjectBriefEditor'
import type { ProjectBrief } from '@/types'

const projectId = '22345678-1234-1234-1234-123456789abc'
const savedBrief: ProjectBrief = {
  project_id: projectId,
  visibility: 'public',
  lifecycle_status: 'active',
  purpose: 'Prepare developers for interviews',
  inspiration: null,
  role_and_contributions: null,
  architecture_and_decisions: null,
  challenges_and_solutions: null,
  outcomes_and_impact: null,
  lessons_learned: null,
  interview_talking_points: null,
  owner_verified_at: '2026-09-12T00:00:00.000Z',
  last_reviewed_at: '2026-09-12T00:00:00.000Z',
  ai_draft: {},
  ai_draft_generated_at: null,
  created_at: '2026-09-12T00:00:00.000Z',
  updated_at: '2026-09-12T00:00:00.000Z',
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('opens a saved brief in read mode and enters editing explicitly', () => {
  render(<ProjectBriefEditor projectId={projectId} initialBrief={savedBrief} />)
  expect(screen.queryByRole('form', { name: 'Edit project brief' })).not.toBeInTheDocument()
  expect(screen.getByText('Prepare developers for interviews')).toBeInTheDocument()
  expect(screen.getByText('Active development')).toBeInTheDocument()
  expect(screen.getByText('Reviewed 2026-09-12')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit brief' }))
  expect(screen.getByRole('form', { name: 'Edit project brief' })).toBeInTheDocument()
})

it('saves owner context, sends the base version, and marks reviewed content', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ brief: savedBrief }) })
  vi.stubGlobal('fetch', fetch)
  render(<ProjectBriefEditor projectId={projectId} />)

  fireEvent.change(screen.getByRole('combobox', { name: 'Lifecycle status' }), { target: { value: 'active' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Portfolio visibility' }), { target: { value: 'public' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Purpose' }), { target: { value: 'Prepare developers for interviews' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /mark this content as owner reviewed/i }))
  fireEvent.submit(screen.getByRole('form', { name: 'Edit project brief' }))

  await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  const [url, options] = fetch.mock.calls[0]
  expect(url).toBe(`/api/projects/${projectId}/brief`)
  expect(options.method).toBe('PATCH')
  expect(JSON.parse(options.body)).toEqual(expect.objectContaining({
    visibility: 'public',
    lifecycleStatus: 'active',
    ownerVerified: true,
    baseUpdatedAt: null,
    purpose: 'Prepare developers for interviews',
  }))
  expect(await screen.findByRole('status')).toHaveTextContent('Project brief saved.')
  expect(screen.getByText('Reviewed 2026-09-12')).toBeInTheDocument()
})

it('sends the loaded updated_at as the base version for an existing brief', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ brief: { ...savedBrief, updated_at: '2026-09-13T00:00:00.000Z' } }) })
  vi.stubGlobal('fetch', fetch)
  render(<ProjectBriefEditor projectId={projectId} initialBrief={savedBrief} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit brief' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Purpose' }), { target: { value: 'Updated purpose' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit project brief' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  expect(JSON.parse(fetch.mock.calls[0][1].body).baseUpdatedAt).toBe('2026-09-12T00:00:00.000Z')
})

it('offers to reload the latest version after a conflict', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'stale' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ brief: savedBrief }) }))
  render(<ProjectBriefEditor projectId={projectId} initialBrief={savedBrief} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit brief' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Purpose' }), { target: { value: 'Stale edit' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit project brief' }))
  expect(await screen.findByRole('status')).toHaveTextContent('updated elsewhere')
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Latest version loaded.')
  expect(screen.getByRole('textbox', { name: 'Purpose' })).toHaveValue('Prepare developers for interviews')
})

it.each(['response', 'network'])('does not expose project brief %s failures', async failure => {
  vi.stubGlobal('fetch', failure === 'network'
    ? vi.fn().mockRejectedValue(new Error('private details'))
    : vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'private details' }) }))
  render(<ProjectBriefEditor projectId={projectId} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Purpose' }), { target: { value: 'Something' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit project brief' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Unable to save the project brief. Please try again.')
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument()
})
