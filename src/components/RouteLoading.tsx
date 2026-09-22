import { Logo } from '@/components/icons/Logo'

type RouteLoadingProps = {
  label: string
  maxWidth: 'max-w-3xl' | 'max-w-5xl' | 'max-w-7xl'
  cards?: number
}

export default function RouteLoading({ label, maxWidth, cards = 3 }: RouteLoadingProps) {
  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-line bg-ink/90">
        <div className={`mx-auto flex ${maxWidth} items-center gap-3 px-4 py-3 sm:px-6`}>
          <Logo className="h-5 w-5 text-brand" />
          <span className="label font-bold tracking-[0.3em]">Proofstack</span>
        </div>
      </header>

      <main aria-busy="true" aria-label={label} className={`mx-auto ${maxWidth} px-4 py-10 sm:px-6`}>
        <div aria-hidden="true">
          <div className="h-3 w-28 bg-raised" />
          <div className="mt-6 h-6 w-48 bg-raised" />

          <div className="mt-8 border border-line bg-surface px-6 py-6">
            <div className="h-4 w-40 bg-raised" />
            <div className="mt-4 h-3 w-3/4 bg-raised" />
            <div className="mt-2 h-3 w-1/2 bg-raised" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: cards }, (_, i) => (
              <div key={i} className="border border-line bg-surface px-5 py-4">
                <div className="h-3 w-24 bg-raised" />
                <div className="mt-3 h-4 w-2/3 bg-raised" />
                <div className="mt-2 h-3 w-1/2 bg-raised" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
