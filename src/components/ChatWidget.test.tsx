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

it('renders markdown in assistant responses but keeps user messages as text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: '**Bold** answer\n\n- item one\n- item two' }),
  }))
  render(<ChatWidget />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about your portfolio' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Question **not bold**' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Send chat message' }))
  const bold = await screen.findByText('Bold')
  expect(bold.tagName).toBe('STRONG')
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText('Question **not bold**')).toBeInTheDocument()
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

it('keeps a failed question for retry instead of sending it as history', async () => {
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ content: 'Recovered' }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<ChatWidget />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about your portfolio' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First question' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Send chat message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to send your message')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Recovered')).toBeInTheDocument()
  // The retried request resends the same question, not a duplicated history.
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages).toEqual([{ role: 'user', content: 'First question' }])
})

it('clears the conversation on demand', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: 'Answer' }) }))
  render(<ChatWidget />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about your portfolio' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Question' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Send chat message' }))
  expect(await screen.findByText('Answer')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Start a new conversation' }))
  expect(screen.queryByText('Answer')).not.toBeInTheDocument()
  expect(screen.getByText(/synced repository metadata and README evidence/)).toBeInTheDocument()
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

it('labels the portfolio launcher and fills the input from a prompt starter without sending', () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<ChatWidget />)
  const launcher = screen.getByRole('button', { name: 'Ask about your portfolio' })
  expect(launcher).toHaveTextContent('Ask portfolio')
  fireEvent.click(launcher)
  expect(screen.getByRole('button', { name: 'Which projects best show backend work?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'What themes connect my projects?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Where is my evidence weakest?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'What themes connect my projects?' }))
  const textbox = screen.getByRole('textbox', { name: 'Chat message' })
  expect(textbox).toHaveValue('What themes connect my projects?')
  expect(textbox).toHaveFocus()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('keeps header controls at least 40px with pointer titles and the launcher at 48px', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: 'Answer' }) }))
  render(<ChatWidget />)
  const launcher = screen.getByRole('button', { name: 'Ask about your portfolio' })
  expect(launcher).toHaveClass('h-12')
  fireEvent.click(launcher)
  const close = screen.getByRole('button', { name: 'Close chat' })
  expect(close).toHaveClass('h-10')
  expect(close).toHaveClass('w-10')
  expect(close).toHaveAttribute('title', 'Close chat')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Question' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Send chat message' }))
  expect(await screen.findByText('Answer')).toBeInTheDocument()
  const restart = screen.getByRole('button', { name: 'Start a new conversation' })
  expect(restart).toHaveClass('h-10')
  expect(restart).toHaveClass('w-10')
  expect(restart).toHaveAttribute('title', 'New conversation')
})

it('shows project-scoped prompt starters instead of portfolio ones', () => {
  render(<ChatWidget projectId="22345678-1234-1234-1234-123456789abc" projectName="Example" />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about Example' }))
  expect(screen.getByRole('button', { name: "What are this project's key decisions?" })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'How should I explain this project?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'What evidence is missing?' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Which projects best show backend work?' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'What themes connect my projects?' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Where is my evidence weakest?' })).not.toBeInTheDocument()
})
