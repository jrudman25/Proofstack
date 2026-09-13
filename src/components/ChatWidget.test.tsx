import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ChatWidget from './ChatWidget'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('unmounts closed chat controls, focuses the input and restores launcher focus on close and Escape', () => {
  render(<ChatWidget />)
  const launcher = screen.getByRole('button', { name: 'Ask about your portfolio' })
  expect(screen.queryByRole('textbox', { hidden: true })).not.toBeInTheDocument()
  fireEvent.click(launcher)
  expect(screen.getByRole('textbox', { name: 'Chat message' })).toHaveFocus()
  expect(screen.getByText(/synced repository metadata and README evidence/)).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Ask about your portfolio' })).toHaveClass('fixed')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
  expect(launcher).toHaveFocus()
  expect(screen.queryByRole('textbox', { hidden: true })).not.toBeInTheDocument()
  fireEvent.click(launcher)
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  expect(launcher).toHaveFocus()
  expect(screen.queryByRole('button', { name: 'Close chat', hidden: true })).not.toBeInTheDocument()
})

it('sends a message through the named form and announces the response', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: 'README answer' }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<ChatWidget />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about your portfolio' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What is this project?' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Send chat message' }))
  expect(await screen.findByText('README answer')).toBeInTheDocument()
  expect(screen.getByRole('log', { name: 'Chat messages' })).toHaveTextContent('README answer')
  expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
    body: JSON.stringify({ messages: [{ role: 'user', content: 'What is this project?' }] }),
  }))
})

it('scopes questions to a project when mounted with one', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: 'Project answer' }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<ChatWidget projectId="22345678-1234-1234-1234-123456789abc" projectName="Example" />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about Example' }))
  expect(screen.getByRole('region', { name: 'Ask about Example' })).toBeInTheDocument()
  expect(screen.getByText(/only Example's repository metadata/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'How is it built?' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Send chat message' }))
  expect(await screen.findByText('Project answer')).toBeInTheDocument()
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    messages: [{ role: 'user', content: 'How is it built?' }],
    projectId: '22345678-1234-1234-1234-123456789abc',
  })
})

it.each(['response', 'network'])('does not expose raw %s errors', async failure => {
  vi.stubGlobal('fetch', failure === 'network'
    ? vi.fn().mockRejectedValue(new Error('secret internal details'))
    : vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'secret internal details' }) }))
  render(<ChatWidget />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about your portfolio' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Question' } })
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByText('Unable to send your message. Please try again.')).toBeInTheDocument()
  expect(screen.queryByText(/secret internal details/)).not.toBeInTheDocument()
})
