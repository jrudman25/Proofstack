import Link from 'next/link'
import { Logo } from '@/components/icons/Logo'

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-sans">
      <div className="mb-10 flex items-center gap-3">
        <Logo className="h-8 w-8 text-brand" />
        <span className="label text-base font-bold tracking-[0.35em]">
          Proofstack
        </span>
      </div>

      <div className="corner-ticks relative w-full max-w-md border border-line bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Sign-in did not complete</h1>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          The GitHub authorization could not be completed. This can happen if the request expired or access was denied. Nothing was signed in or changed.
        </p>
        <Link
          href="/login"
          className="label mt-8 inline-flex w-full items-center justify-center gap-2 border border-brand-dim bg-brand px-4 py-2.5 text-on-brand transition-colors hover:bg-brand/90"
        >
          Try signing in again
        </Link>
      </div>
    </div>
  )
}
