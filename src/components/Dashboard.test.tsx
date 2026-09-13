import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import type { Project } from '@/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const project: Project = {
  id: 'p1', user_id: 'u1', github_repo_id: 1, name: 'Example', full_name: 'owner/Example',
  description: 'Example repository', html_url: 'https://github.com/owner/Example', language: 'TypeScript',
  homepage: null, stargazers_count: 1, pushed_at: null, summary: 'A legacy summary', technologies: ['MongoDB', 'Next.js'],
  has_code_map: false, created_at: '2026-01-01', updated_at: '2026-03-04T10:00:00.000Z',
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear() })

it('names search and GitHub links and exposes selected sorting', () => {
  render(<Dashboard initialProjects={[project]} />)
  const link = screen.getByRole('link', { name: 'View Example on GitHub (opens in new tab)' })
  expect(link).toHaveAttribute('href', project.html_url)
  link.focus()
  expect(link).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Recently Updated' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Alphabetical' }))
  expect(screen.getByRole('button', { name: 'Alphabetical' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByRole('textbox', { name: 'Search projects and technologies' }), { target: { value: 'missing' } })
  expect(screen.getByText('No projects found')).toBeInTheDocument()
})

it('shows GitHub facts rather than legacy summaries and names technology icons', () => {
  render(<Dashboard initialProjects={[project]} />)
  expect(screen.getByText('Example repository')).toBeInTheDocument()
  expect(screen.queryByText('A legacy summary')).not.toBeInTheDocument()
  expect(screen.getByText('Synced 2026-03-04')).toBeInTheDocument()
  const mongo = screen.getByRole('img', { name: 'MongoDB' })
  expect(mongo.querySelector('i')).toHaveClass('devicon-mongodb-plain')
  expect(screen.getByRole('img', { name: 'Next.js' }).querySelector('i')).toHaveClass('devicon-nextjs-original')
  mongo.focus()
  expect(mongo).toHaveFocus()
})

it('shows the primary language as both labeled metadata and a stack icon when no technologies were generated', () => {
  render(<Dashboard initialProjects={[{ ...project, technologies: [] }]} />)
  expect(screen.getAllByText('TypeScript')).toHaveLength(2)
  expect(screen.getByRole('img', { name: 'TypeScript' }).querySelector('i')).toHaveClass('devicon-typescript-plain')
})

it('does not duplicate the primary language in the stack icons', () => {
  render(<Dashboard initialProjects={[{ ...project, technologies: ['typescript', 'React'] }]} />)
  expect(screen.getAllByRole('img', { name: /typescript/i })).toHaveLength(1)
  expect(screen.getByRole('img', { name: 'TypeScript' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'React' })).toBeInTheDocument()
})

it('uses bundled logos for detected frontend technologies', () => {
  render(<Dashboard initialProjects={[{ ...project, technologies: ['Vite', 'Material UI'] }]} />)
  expect(screen.getByRole('img', { name: 'Vite' }).querySelector('i')).toHaveClass('devicon-vitejs-plain')
  expect(screen.getByRole('img', { name: 'Material UI' }).querySelector('i')).toHaveClass('devicon-materialui-plain')
})

it('keeps the briefing as the only primary action and disables it without projects', () => {
  render(<Dashboard initialProjects={[]} />)
  expect(screen.getByRole('button', { name: 'Prepare briefing' })).toBeDisabled()
  expect(screen.getAllByRole('button', { name: 'Sync GitHub' }).length).toBeGreaterThan(0)
  expect(screen.getByText(/Sync your GitHub account/)).toBeInTheDocument()
})

it('refreshes server data after a successful sync and reports the count', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ syncedCount: 3 }) }))
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync GitHub' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Synced 3 projects.')
  expect(refresh).toHaveBeenCalledOnce()
})

it('shows sanitized client-side sync errors from the API', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Too many requests' }) }))
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync GitHub' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Too many requests')
})

it.each(['response', 'network'])('sanitizes sync %s errors', async failure => {
  vi.stubGlobal('fetch', failure === 'network'
    ? vi.fn().mockRejectedValue(new Error('private details'))
    : vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'private details' }) }))
  render(<Dashboard initialProjects={[project]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync GitHub' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Unable to sync projects. Please try again.')
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument()
})
