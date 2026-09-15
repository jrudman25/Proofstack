import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProjectDetailClient from './ProjectDetailClient'
import type { Project } from '@/types'

const database = vi.hoisted(() => ({ eq: vi.fn(), single: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from: () => ({
    update: database.update,
    delete: database.delete,
    insert: database.insert,
  }) }),
}))

const project: Project = {
  id: 'p1', user_id: 'u1', github_repo_id: 1, name: 'Example', full_name: 'owner/Example',
  description: null, html_url: 'https://github.com/owner/Example', language: null,
  homepage: null, stargazers_count: 0, pushed_at: null, summary: null, technologies: [],
  is_private: false, ai_opt_in: false, github_created_at: null,
  has_code_map: false, created_at: '2026-01-01', updated_at: '2026-01-01',
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  database.eq.mockResolvedValue({ error: null })
  database.update.mockReturnValue({ eq: database.eq })
  database.delete.mockReturnValue({ eq: database.eq })
  database.insert.mockReturnValue({ select: () => ({ single: database.single }) })
})
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('exposes completion state and named delete controls', async () => {
  render(<ProjectDetailClient project={project}
    initialMilestones={[{ id: 'm1', project_id: 'p1', title: 'Release', status: 'pending', created_at: '' }]}
    initialTodos={[{ id: 't1', project_id: 'p1', task: 'Write docs', is_completed: false, created_at: '' }]} />)
  const milestone = screen.getByRole('button', { name: 'Complete milestone: Release' })
  const task = screen.getByRole('button', { name: 'Complete task: Write docs' })
  expect(milestone).toHaveAttribute('aria-pressed', 'false')
  expect(task).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(milestone)
  fireEvent.click(task)
  await waitFor(() => {
    expect(milestone).toHaveAttribute('aria-pressed', 'true')
    expect(task).toHaveAttribute('aria-pressed', 'true')
  })
  fireEvent.click(task)
  await waitFor(() => expect(task).toHaveAttribute('aria-pressed', 'false'))
  const remove = screen.getByRole('button', { name: 'Delete task: Write docs' })
  remove.focus()
  expect(remove).toHaveFocus()
  fireEvent.click(remove)
  expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
})

it('does not offer legacy tasks or milestones to projects without existing records', () => {
  render(<ProjectDetailClient project={project} initialMilestones={[]} initialTodos={[]} />)
  expect(screen.queryByRole('form', { name: 'Add task' })).not.toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Add milestone' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Legacy tasks and milestones/)).not.toBeInTheDocument()
  expect(screen.getByRole('form', { name: 'Edit project brief' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ask about Example' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Index README' })).toBeInTheDocument()
})

it('indexes the README through the project endpoint and reports the result', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ indexed: true }) }))
  render(<ProjectDetailClient project={project} initialMilestones={[]} initialTodos={[]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Index README' }))
  expect(await screen.findByRole('status')).toHaveTextContent('README indexed for chat and briefings.')
  expect(fetch).toHaveBeenCalledWith('/api/projects/p1/index', { method: 'POST' })
})

it('gates AI processing behind explicit consent on private repositories', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aiOptIn: true }) }))
  const privateProject = { ...project, is_private: true }
  render(<ProjectDetailClient project={privateProject} initialMilestones={[]} initialTodos={[]} />)
  expect(screen.getByText('Private repository')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Index README' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Ask about Example' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Enable AI processing' }))
  expect(await screen.findByRole('status')).toHaveTextContent('AI processing enabled for this repository.')
  expect(fetch).toHaveBeenCalledWith('/api/projects/p1', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ aiOptIn: true }),
  }))
  expect(screen.getByRole('button', { name: 'Index README' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Ask about Example' })).toBeInTheDocument()
})

it('disables brief editing when the saved brief could not be loaded', () => {
  render(<ProjectDetailClient project={project} briefLoadFailed initialMilestones={[]} initialTodos={[]} />)
  expect(screen.queryByRole('form', { name: 'Edit project brief' })).not.toBeInTheDocument()
  expect(screen.getByText(/editing is disabled to protect your saved content/)).toBeInTheDocument()
})

it('submits named task and milestone forms for projects with existing legacy records', async () => {
  render(<ProjectDetailClient project={project} initialMilestones={[]}
    initialTodos={[{ id: 't1', project_id: 'p1', task: 'Write docs', is_completed: false, created_at: '' }]} />)
  expect(screen.getByText(/Legacy tasks and milestones/)).toBeInTheDocument()
  database.single.mockResolvedValueOnce({ data: { id: 't2', task: 'Test app', is_completed: false } })
  fireEvent.change(screen.getByRole('textbox', { name: 'New task' }), { target: { value: 'Test app' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Add task' }))
  expect(await screen.findByRole('button', { name: 'Complete task: Test app' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('textbox', { name: 'New task' })).toHaveValue('')
  database.single.mockResolvedValueOnce({ data: { id: 'm2', title: 'Launch', status: 'pending' } })
  const form = screen.getByRole('form', { name: 'Add milestone' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'New milestone' }), { target: { value: 'Launch' } })
  fireEvent.submit(form)
  expect(await screen.findByRole('button', { name: 'Complete milestone: Launch' })).toHaveAttribute('aria-pressed', 'false')
})
