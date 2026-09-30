import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProjectDetailClient from './ProjectDetailClient'
import type { Project, ProjectBrief } from '@/types'

const project: Project = {
  id: 'p1', user_id: 'u1', github_repo_id: 1, name: 'Example', full_name: 'owner/Example',
  description: null, html_url: 'https://github.com/owner/Example', language: null,
  homepage: null, stargazers_count: 0, pushed_at: null, technologies: [],
  is_private: false, ai_opt_in: false, github_created_at: null,
  github_fork: false, github_owner_login: 'owner', github_owner_type: 'User',
  has_code_map: false, github_deleted_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
}

// Opening a project page auto-indexes missing or stale README evidence; the
// default stub answers that background call unless a test overrides fetch.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ indexed: true }) }))
})
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('places the project brief immediately after the repository header and before the AI evidence disclosure', () => {
  // Fresh indexed evidence keeps this layout check from firing auto-index.
  const { container } = render(<ProjectDetailClient project={project} readmeIndexExists />)
  const brief = screen.getByRole('region', { name: 'Project brief' })
  const evidence = container.querySelector('#ai-evidence')
  expect(evidence).not.toBeNull()
  expect(evidence).toHaveTextContent('AI evidence')
  expect(brief.compareDocumentPosition(evidence!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByText(/Legacy tasks and milestones/)).not.toBeInTheDocument()
})

it('reports evidence status in the AI evidence summary', async () => {
  const first = render(<ProjectDetailClient project={project} />)
  expect(first.container.querySelector('#ai-evidence')).toHaveTextContent('README evidence not indexed')
  // The auto-index fetch resolves asynchronously; let it settle before unmount.
  await first.findByRole('status')
  first.unmount()
  const indexed = render(<ProjectDetailClient project={{ ...project, pushed_at: '2026-01-01' }} readmeIndexExists readmeIndexedPushedAt="2026-01-01" />)
  expect(indexed.container.querySelector('#ai-evidence')).toHaveTextContent('README evidence indexed')
  indexed.unmount()
  const stale = render(<ProjectDetailClient project={{ ...project, pushed_at: '2026-02-01' }} readmeIndexExists readmeIndexedPushedAt="2026-01-01" />)
  expect(stale.container.querySelector('#ai-evidence')).toHaveTextContent('indexed but stale')
  await stale.findByRole('status')
})

it('indexes the README automatically on open and reports the result', async () => {
  render(<ProjectDetailClient project={project} />)
  expect(await screen.findByRole('status')).toHaveTextContent('README indexed for chat and briefings.')
  expect(fetch).toHaveBeenCalledWith('/api/projects/p1/index', { method: 'POST' })
})

it('does not auto-index fresh evidence but still allows a manual reindex', async () => {
  render(<ProjectDetailClient project={{ ...project, pushed_at: '2026-01-01' }} readmeIndexExists readmeIndexedPushedAt="2026-01-01" />)
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reindex README' }))
  expect(await screen.findByRole('status')).toHaveTextContent('README indexed for chat and briefings.')
  expect(fetch).toHaveBeenCalledWith('/api/projects/p1/index', { method: 'POST' })
})

it('does not index a private repository without consent, but indexes once consent is granted', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/index')) return { ok: true, json: async () => ({ indexed: true }) }
    return { ok: true, json: async () => ({ aiOptIn: true }) }
  }))
  const privateProject = { ...project, is_private: true }
  const { container } = render(<ProjectDetailClient project={privateProject} />)
  expect(container.querySelector('#ai-evidence')).toHaveTextContent('AI processing off for this private repository')
  expect(screen.getByText('Private repository')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Index README' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Ask about Example' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Enable AI processing' }))
  await screen.findByText('AI processing enabled for this repository.')
  expect(fetch).toHaveBeenCalledWith('/api/projects/p1', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ aiOptIn: true }),
  }))
  // Consent unlocks indexing immediately rather than requiring a second click.
  expect(fetch).toHaveBeenCalledWith('/api/projects/p1/index', { method: 'POST' })
  await screen.findByText('README indexed for chat and briefings.')
  expect(screen.getByRole('button', { name: 'Reindex README' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Ask about Example' })).toBeInTheDocument()
})

const savedBrief: ProjectBrief = {
  project_id: 'p1', visibility: 'private', lifecycle_status: null, purpose: null,
  inspiration: null, role_and_contributions: null, architecture_and_decisions: null,
  challenges_and_solutions: null, outcomes_and_impact: null, lessons_learned: null,
  interview_talking_points: null, published_fields: [], owner_verified_at: null,
  last_reviewed_at: null, ai_draft: {}, ai_draft_generated_at: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
}

it('does not toggle AI consent when the brief is edited', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ brief: savedBrief }) })
  vi.stubGlobal('fetch', fetchMock)
  const privateProject = { ...project, is_private: true }
  render(<ProjectDetailClient project={privateProject} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Purpose' }), { target: { value: 'Interview context' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Edit project brief' }))
  await screen.findByRole('status')
  expect(screen.getByRole('button', { name: 'Enable AI processing' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ask about Example' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Index README' })).toBeDisabled()
})

it('disables brief editing when the saved brief could not be loaded', () => {
  render(<ProjectDetailClient project={project} briefLoadFailed readmeIndexExists />)
  expect(screen.queryByRole('form', { name: 'Edit project brief' })).not.toBeInTheDocument()
  expect(screen.getByText(/editing is disabled to protect your saved content/)).toBeInTheDocument()
  const brief = screen.getByRole('region', { name: 'Project brief' })
  const evidence = screen.getByText('AI evidence').closest('details')
  expect(evidence).toHaveAttribute('id', 'ai-evidence')
  expect(brief.compareDocumentPosition(evidence!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
