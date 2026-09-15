import Link from 'next/link'
import { Logo } from '@/components/icons/Logo'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-sans">
      <div className="mb-8 flex items-center gap-3">
        <Logo className="h-7 w-7 text-brand" />
        <span className="label text-base font-bold tracking-[0.35em]">
          Proofstack
        </span>
      </div>

      <div className="corner-ticks w-full max-w-md border border-line bg-surface p-8 text-center">
        <p className="font-mono text-[11px] text-brand">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          This page does not exist, or it may require signing in first.
        </p>
        <Link
          href="/"
          className="eyebrow mt-6 inline-flex items-center gap-2 border border-line px-4 py-2 text-dim transition-colors hover:border-line-bright hover:text-foreground"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
