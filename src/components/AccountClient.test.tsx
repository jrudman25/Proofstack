import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AccountClient from './AccountClient'
import type { PublicationProject } from './AccountClient'

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: vi.fn().mockResolvedValue({}) } }),
}))

const draftPublication = { slug: null, published: false, briefingPublishedAt: null, hasBriefing: true, unclaimedAnalysisOptOut: false }
const livePublication = {
  slug: 'octocat', published: true,
  briefingPublishedAt: '2026-09-20T00:00:00.000Z', hasBriefing: true, unclaimedAnalysisOptOut: false,
}

const selectedProject: PublicationProject = {
  id: 'p1', name: 'Example', isPrivate: false, visibility: 'public', publishedFields: ['purpose'],
}
const unselectedProject: PublicationProject = {
  id: 'p2', name: 'Sidepiece', isPrivate: false, visibility: 'private', publishedFields: [],
}
const privateProject: PublicationProject = {
  id: 'p3', name: 'Secret', isPrivate: true, visibility: 'private', publishedFields: [],
}

const profileResponse = { public_slug: 'octocat', profile_published: true, profile_published_at: '2026-09-21T00:00:00.000Z', public_briefing_published_at: '2026-09-21T00:00:00.000Z', unclaimed_analysis_opt_out: false }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('stages the public profile checklist in order and disables publish until prerequisites are met', () => {
  render(<AccountClient email="me@example.com" publication={draftPublication}
    publicationProjects={[selectedProject, unselectedProject, privateProject]} />)
  const region = screen.getByRole('region', { name: 'Public profile' })
  expect(within(region).getAllByRole('heading').map(heading => heading.textContent)).toEqual([
    'Public profile', '01 · Profile URL', '02 · Public projects', '03 · Briefing snapshot', '04 · Profile state',
  ])

  const projectStage = screen.getByRole('heading', { name: /Public projects/ }).closest('li')!
  expect(projectStage).toHaveTextContent('1 selected project')
  expect(projectStage).not.toHaveTextContent('publishing fields')
  expect(within(projectStage).getByRole('link', { name: 'Example' })).toHaveAttribute('href', '/project/p1#publication-settings')
  expect(within(projectStage).getByRole('link', { name: 'Sidepiece' })).toHaveAttribute('href', '/project/p2#publication-settings')
  expect(projectStage).toHaveTextContent('Selected, 1 field')
  expect(projectStage).toHaveTextContent('Not selected')
  expect(projectStage).toHaveTextContent('1 private repository excluded')
  expect(screen.queryByRole('link', { name: 'Secret' })).not.toBeInTheDocument()

  const publish = screen.getByRole('button', { name: 'Publish profile' })
  expect(publish).toBeDisabled()
  const stateStage = screen.getByRole('heading', { name: /Profile state/ }).closest('li')!
  expect(stateStage).toHaveTextContent('Save a profile URL first.')
  expect(screen.queryByRole('link', { name: /\/u\// })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help')
})

it('keeps publishing disabled while no selected project publishes a field', () => {
  render(<AccountClient email={null} publication={{ ...draftPublication, slug: 'octocat' }}
    publicationProjects={[unselectedProject]} />)
  const publish = screen.getByRole('button', { name: 'Publish profile' })
  expect(publish).toBeDisabled()
  expect(screen.getByText('Select at least one field on a public project brief.')).toBeInTheDocument()
  expect(screen.queryByText('Save a profile URL first.')).not.toBeInTheDocument()
})

it('saves the profile URL and then allows publishing', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: profileResponse }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<AccountClient email={null} publication={{ ...draftPublication, slug: 'octocat' }}
    publicationProjects={[selectedProject, privateProject]} />)

  const publish = screen.getByRole('button', { name: 'Publish profile' })
  expect(publish).toBeEnabled()
  fireEvent.click(publish)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ published: true })
  expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
  expect(screen.getByRole('button', { name: 'Unpublish profile' })).toBeEnabled()
  expect(screen.getByRole('link', { name: '/u/octocat' })).toBeInTheDocument()
})

it('unpublishes a live profile and keeps the preview link honest', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ profile: { ...profileResponse, profile_published: false } }),
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<AccountClient email={null} publication={livePublication} publicationProjects={[selectedProject]} />)
  expect(screen.getByRole('link', { name: '/u/octocat' })).toHaveAttribute('href', '/u/octocat')
  fireEvent.click(screen.getByRole('button', { name: 'Unpublish profile' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ published: false })
  expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
  expect(screen.queryByRole('link', { name: '/u/octocat' })).not.toBeInTheDocument()
})

it('keeps the briefing snapshot action disabled without a generated briefing', () => {
  render(<AccountClient email={null} publication={{ ...draftPublication, hasBriefing: false }}
    publicationProjects={[selectedProject]} />)
  expect(screen.getByRole('button', { name: 'Publish latest briefing' })).toBeDisabled()
  expect(screen.getByText('Generate a briefing on the dashboard first.')).toBeInTheDocument()
})

it('publishes the latest briefing snapshot when one exists', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: profileResponse }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<AccountClient email={null} publication={draftPublication} publicationProjects={[selectedProject]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Publish latest briefing' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ publishBriefing: true })
})

it('shows a recoverable status and blocks publishing when projects fail to load', () => {
  render(<AccountClient email={null} publication={{ ...draftPublication, slug: 'octocat' }}
    publicationProjects={[]} publicationProjectsFailed />)
  expect(screen.getByRole('alert')).toHaveTextContent('projects could not be loaded')
  expect(screen.getByRole('button', { name: 'Publish profile' })).toBeDisabled()
  expect(screen.getByText(/publication state cannot be verified/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
  expect(router.refresh).toHaveBeenCalledOnce()
})

it('toggles the unclaimed-analysis opt-out through the profile API', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ profile: { ...profileResponse, unclaimed_analysis_opt_out: true } }),
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<AccountClient email={null} publication={draftPublication} publicationProjects={[]} />)
  const toggle = screen.getByRole('checkbox', { name: 'Exclude me' })
  expect(toggle).not.toBeChecked()
  fireEvent.click(toggle)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ unclaimedAnalysisOptOut: true })
  expect(toggle).toBeChecked()
})

it('links to the preserved legacy task export', () => {
  render(<AccountClient email={null} publication={draftPublication} publicationProjects={[]} />)
  expect(screen.getByRole('link', { name: /Download JSON/ })).toHaveAttribute('href', '/api/account/legacy-export')
})
