import ReactMarkdown, { type Components } from 'react-markdown'

// Renders model output as markdown. react-markdown never evaluates raw HTML,
// so injected markup in repository-derived text renders as literal text.
// Links always open in a new tab and only protocols react-markdown's default
// URL sanitizer allows (http, https, mailto, ...) survive.
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2 transition-colors hover:text-foreground">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="marker:text-faint">{children}</li>,
  code: ({ children, className }) => (
    <code className={`border border-line bg-ink px-1 py-0.5 font-mono text-[12px] ${className || ''}`}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="chat-pre my-2 overflow-x-auto border border-line bg-ink p-2.5 font-mono text-[12px] leading-relaxed">{children}</pre>
  ),
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-line pl-3 text-dim">{children}</blockquote>,
  hr: () => <hr className="my-3 border-line" />,
  h1: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  h2: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  h5: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  h6: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-[13px]">{children}</table></div>
  ),
  th: ({ children }) => <th className="border border-line bg-surface px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-line px-2 py-1 align-top">{children}</td>,
}

export default function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-md text-sm leading-relaxed">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
