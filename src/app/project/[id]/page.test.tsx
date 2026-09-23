import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProjectPage from './page'
import type { Project } from '@/types'

const io = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound: io.notFound, redirect: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: io.getUser }, from: io.from }),
}))

const userId = '12345678-1234-1234-1234-123456789abc'
const projectId = '22345678-1234-1234-1234-123456789abc'
const project: Project = {
  id: projectId, user_id: userId, github_repo_id: 42, name: 'Example', full_name: 'owner/Example',
  description: 'Example repository', html_url: 'https://github.com/owner/Example', language: 'TypeScript',
  homepage: null, stargazers_count: 1, pushed_at: null, github_created_at: '2025-01-01T00:00:00.000Z',
  is_private: false, ai_opt_in: false, github_fork: false, github_owner_login: 'owner',
  github_owner_type: 'User', technologies: [], has_code_map: false, github_deleted_at: null,
  created_at: '2026-01-01', updated_at: '2026-03-04T10:00:00.000Z',
}

function builder(data: unknown) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'order']) query[method] = vi.fn(() => query)
  query.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  return query
}

beforeEach(() => {
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.from.mockImplementation((table: string) => builder(table === 'projects' ? project : null))
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('returns not found for a non-UUID id without querying the database', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(ProjectPage({ params: Promise.resolve({ id: 'abc' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  expect(io.notFound).toHaveBeenCalledOnce()
  expect(io.from).not.toHaveBeenCalled()
  expect(consoleError).not.toHaveBeenCalled()
})

it('queries and renders the project for a valid UUID', async () => {
  render(await ProjectPage({ params: Promise.resolve({ id: projectId }) }))
  expect(io.from).toHaveBeenCalledWith('projects')
  expect(await screen.findByRole('heading', { name: 'Example' })).toBeInTheDocument()
})
