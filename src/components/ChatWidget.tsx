'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Bot } from 'lucide-react'

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
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
  }, [messages])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading) return

    const newMessages = [...messages, { role: 'user', content: input }]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })

      const data = await res.json()
      if (!res.ok || typeof data.content !== 'string') throw new Error('Chat request failed')
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Unable to send your message. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        ref={launcherRef}
        aria-label="Open chat"
        aria-expanded={isOpen}
        aria-controls="portfolio-chat"
        aria-hidden={isOpen}
        tabIndex={isOpen ? -1 : 0}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center border border-brand-dim bg-raised shadow-2xl transition-transform hover:scale-105 hover:bg-brand hover:text-on-brand sm:bottom-6 sm:right-6 ${isOpen ? 'scale-0' : 'scale-100'}`}
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {isOpen && <div id="portfolio-chat" role="region" aria-labelledby="chat-title" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); closeChat() } }} className="corner-ticks fixed inset-x-3 bottom-3 z-50 flex h-[min(500px,calc(100dvh-1.5rem))] flex-col border border-line bg-surface shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line p-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand" />
            <h3 id="chat-title" className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-300">
              Proofstack_Chat
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <kbd className="hidden border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase text-faint sm:inline">esc</kbd>
            <button aria-label="Close chat" onClick={closeChat} className="text-faint transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div role="log" aria-label="Chat messages" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">Ask // README_Index</p>
              <p className="mx-auto mt-3 max-w-[260px] text-sm text-faint">
                Ask about your portfolio using indexed repository metadata and README evidence.
              </p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] border px-3.5 py-2 ${
                msg.role === 'user'
                  ? 'border-brand-dim bg-brand/10 text-zinc-100'
                  : 'border-line bg-raised text-zinc-300'
              }`}>
                <span className={`mb-1 block font-mono text-[9px] uppercase tracking-[0.2em] ${msg.role === 'user' ? 'text-brand' : 'text-faint'}`}>
                  {msg.role === 'user' ? 'you' : 'stack'}
                </span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
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
              className="w-full border border-line bg-surface py-2 pl-8 pr-3 font-mono text-sm placeholder:text-faint focus:border-brand-dim focus:outline-none"
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
