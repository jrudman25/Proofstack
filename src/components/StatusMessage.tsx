export type StatusNotice = { text: string; tone: 'info' | 'error' }

export default function StatusMessage({ tone = 'info', className = '', children }: {
  tone?: 'info' | 'error'
  className?: string
  children: React.ReactNode
}) {
  return (
    <p role="status" className={`text-sm leading-relaxed ${tone === 'error' ? 'text-destructive' : 'text-foreground/90'} ${className}`}>
      {children}
    </p>
  )
}
