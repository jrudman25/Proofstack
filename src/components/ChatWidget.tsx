'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Bot, RotateCcw } from 'lucide-react'
import ChatMarkdown from '@/components/ChatMarkdown'

// Request history is bounded so long conversations never exceed the API's
// message and character limits. The latest user question is always kept.
const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_CHARS = 16000

const PORTFOLIO_PROMPTS = [
  'Which projects best show backend work?',
  'What themes connect my projects?',
  'Where is my evidence weakest?',
]

const PROJECT_PROMPTS = [
  "What are this project's key decisions?",
  'How should I explain this project?',
  'What evidence is missing?',
]

type Message = { role: 'user' | 'assistant'; content: string }

function boundHistory(messages: Message[]): { messages: Message[]; truncated: boolean } {
  const kept: Message[] = []
  let chars = 0
  for (let i = messages.length - 1; i >= 0 && kept.length < MAX_HISTORY_MESSAGES; i--) {
    if (chars + messages[i].content.length > MAX_HISTORY_CHARS && kept.length > 0) break
    chars += messages[i].content.length
    kept.unshift(messages[i])
  }
  // Keep an even boundary so a kept assistant reply is not orphaned from its
  // user question; the last message is always the current user question.
  while (kept.length > 1 && kept[0].role === 'assistant') kept.shift()
  return { messages: kept, truncated: kept.length < messages.length }
}

// When mounted with a projectId, questions are answered from that project's
// evidence only; otherwise the whole portfolio is in scope.
export default function ChatWidget({ projectId, projectName }: { projectId?: string; projectName?: string } = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Transport failures stay out of the conversation: the failed question is
  // preserved for retry and never sent to the model as history.
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const closeChat = () => {
    setIsOpen(false)
    launcherRef.current?.focus()
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, error])

  const send = async (question: string, base: Message[]) => {
    const outbound = boundHistory([...base, { role: 'user' as const, content: question }])
    setTruncated(outbound.truncated)
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectId ? { messages: outbound.messages, projectId } : { messages: outbound.messages })
      })

      const data = await res.json()
      if (!res.ok || typeof data.content !== 'string') {
        setFailedQuestion(question)
        setError(typeof data.error === 'string' && res.status < 500 ? data.error : 'Unable to send your message. Please try again.')
        return
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
      setFailedQuestion(null)
    } catch {
      setFailedQuestion(question)
      setError('Unable to send your message. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const question = input.trim()
    if (!question || isLoading) return
    setMessages(prev => [...prev, { role: 'user' as const, content: question }])
    setInput('')
    setFailedQuestion(null)
    await send(question, messages)
  }

  const retry = () => {
    if (!failedQuestion || isLoading) return
    // The failed question was already appended to the visible conversation;
    // resend it against the history that precedes it.
    setMessages(prev => {
      const base = prev[prev.length - 1]?.role === 'user' && prev[prev.length - 1]?.content === failedQuestion
        ? prev.slice(0, -1)
        : prev
      void send(failedQuestion, base)
      return prev
    })
  }

  const newConversation = () => {
    setMessages([])
    setFailedQuestion(null)
    setError('')
    setTruncated(false)
    inputRef.current?.focus()
  }

  const startPrompt = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  const prompts = projectName ? PROJECT_PROMPTS : PORTFOLIO_PROMPTS

  return (
    <>
      <button
        ref={launcherRef}
        aria-label={projectName ? `Ask about ${projectName}` : 'Ask about your portfolio'}
        aria-expanded={isOpen}
        aria-controls="portfolio-chat"
        aria-hidden={isOpen}
        tabIndex={isOpen ? -1 : 0}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-50 flex items-center justify-center border border-brand-dim bg-raised shadow-2xl transition-transform hover:scale-105 hover:bg-brand hover:text-on-brand sm:bottom-6 sm:right-6 ${projectName ? 'h-12 w-12' : 'h-12 gap-2 px-4'} ${isOpen ? 'scale-0' : 'scale-100'}`}
      >
        <MessageSquare className="h-5 w-5" />
        {!projectName && <span className="eyebrow hidden sm:inline">Ask portfolio</span>}
      </button>

      {isOpen && <div id="portfolio-chat" role="region" aria-labelledby="chat-title" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); closeChat() } }} className="corner-ticks fixed inset-x-3 bottom-3 z-50 flex h-[min(500px,calc(100dvh-1.5rem))] flex-col border border-line bg-surface shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line p-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand" />
            <h3 id="chat-title" className="label text-dim">
              {projectName ? `Ask about ${projectName}` : 'Ask about your portfolio'}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                aria-label="Start a new conversation"
                title="New conversation"
                onClick={newConversation}
                className="flex h-10 w-10 items-center justify-center text-dim transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <kbd className="hidden border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-faint sm:inline">esc</kbd>
            <button
              aria-label="Close chat"
              title="Close chat"
              onClick={closeChat}
              className="flex h-10 w-10 items-center justify-center text-dim transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div role="log" aria-label="Chat messages" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center">
              <p className="mx-auto max-w-[260px] text-sm text-dim">
                {projectName
                  ? `Answers use only ${projectName}'s repository metadata and README evidence.`
                  : 'Answers use your synced repository metadata and README evidence, with no outside knowledge.'}
              </p>
              <div className="mx-auto mt-5 flex max-w-[280px] flex-col gap-2">
                {prompts.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => startPrompt(prompt)}
                    className="border border-line bg-raised px-3 py-2 text-left text-xs leading-relaxed text-dim transition-colors hover:border-line-bright hover:text-foreground focus-visible:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {truncated && (
            <p className="text-center font-mono text-[10px] text-dim">Earlier messages are omitted from new answers.</p>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] border px-3.5 py-2 ${
                msg.role === 'user'
                  ? 'border-brand-dim bg-brand/10 text-foreground'
                  : 'border-line bg-raised text-foreground/90'
              }`}>
                <span className={`eyebrow mb-1 block ${msg.role === 'user' ? 'text-brand' : 'text-dim'}`}>
                  {msg.role === 'user' ? 'You' : 'Proofstack'}
                </span>
                {msg.role === 'user' ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <ChatMarkdown content={msg.content} />
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 border border-line bg-raised px-3.5 py-2.5">
                <div className="h-1.5 w-1.5 animate-bounce bg-brand" />
                <div className="h-1.5 w-1.5 animate-bounce bg-brand delay-100" />
                <div className="h-1.5 w-1.5 animate-bounce bg-brand delay-200" />
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-center justify-between gap-3 border border-line bg-raised px-3.5 py-2.5">
              <p className="text-sm text-dim">{error}</p>
              {failedQuestion && (
                <button onClick={retry} className="eyebrow shrink-0 text-brand hover:underline">Retry</button>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form aria-label="Send chat message" onSubmit={handleSend} className="flex gap-2 border-t border-line bg-ink p-3">
          <div className="relative flex-1">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-mono text-xs text-brand">
              &gt;
            </span>
            <input
              ref={inputRef}
              aria-label="Chat message"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="field bg-surface py-2 pl-8 pr-3"
            />
          </div>
          <button
            aria-label="Send message"
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center justify-center border border-brand-dim bg-brand/10 px-3 text-brand transition-colors hover:bg-brand hover:text-on-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand/10 disabled:hover:text-brand"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>}
    </>
  )
}
