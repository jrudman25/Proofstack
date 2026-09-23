import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/icons/Logo'
import { createClient } from '@/utils/supabase/server'

export const metadata: Metadata = {
  title: 'Help and FAQ · Proofstack',
  description: 'Learn how repository sync, AI features, private repository consent, public profiles, and account controls work in Proofstack.',
}

const topics = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'data-and-ai', label: 'Data and AI' },
  { id: 'public-profiles', label: 'Public profiles' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
]

function Question({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <article className="border-t border-line pt-5">
      <h3 className="text-base font-semibold tracking-tight text-foreground">{question}</h3>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/80">{children}</div>
    </article>
  )
}

export default async function HelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const destination = user ? { href: '/', label: 'Dashboard' } : { href: '/login', label: 'Sign in' }

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-line bg-ink/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-5 w-5 text-brand" />
            <span className="label font-bold tracking-[0.3em]">Proofstack</span>
          </Link>
          <nav aria-label="Help navigation" className="flex items-center gap-4">
            <Link href="/privacy" className="eyebrow inline-flex min-h-10 items-center text-dim transition-colors hover:text-foreground">Privacy</Link>
            <Link
              href={destination.href}
              className="inline-flex min-h-10 items-center border border-brand-dim bg-brand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-on-brand transition-colors hover:bg-brand/90"
            >
              {destination.label}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-3xl">
          <p className="eyebrow text-brand">Product guide</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Help and frequently asked questions</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dim sm:text-base">
            Learn what Proofstack imports, how generated answers are grounded, and which controls keep private work and public profiles separate.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="Help topics" className="lg:sticky lg:top-8 lg:self-start">
            <p className="eyebrow text-dim">On this page</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {topics.map(topic => (
                <li key={topic.id}>
                  <a href={`#${topic.id}`} className="block border-l border-line px-3 py-1.5 text-sm text-dim transition-colors hover:border-brand hover:text-foreground">{topic.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-12">
            <section id="getting-started" aria-labelledby="getting-started-heading" className="scroll-mt-8 space-y-5">
              <div>
                <p className="eyebrow text-brand">01</p>
                <h2 id="getting-started-heading" className="mt-2 text-xl font-semibold tracking-tight">Getting started</h2>
              </div>
              <Question question="What is Proofstack for?">
                <p>Proofstack helps you rediscover and explain your GitHub project work. It combines repository facts, context you write, and clearly labeled AI interpretation into portfolio briefings, project pages, and grounded chat.</p>
              </Question>
              <Question question="How do I build my first briefing?">
                <ol className="list-decimal space-y-2 pl-5">
                  <li>Sign in with GitHub and sync your repositories.</li>
                  <li>Open important projects and add your role, decisions, outcomes, and other context.</li>
                  <li>Generate a portfolio briefing from the dashboard, then review it before using or publishing it.</li>
                </ol>
              </Question>
              <Question question="What does repository sync import?">
                <p>Sync imports GitHub repository metadata, language data, and a bounded set of root manifests used to detect technologies. README evidence is indexed only when you choose to index a project. Proofstack does not crawl or index an entire source tree.</p>
              </Question>
            </section>

            <section id="data-and-ai" aria-labelledby="data-and-ai-heading" className="scroll-mt-8 space-y-5">
              <div>
                <p className="eyebrow text-brand">02</p>
                <h2 id="data-and-ai-heading" className="mt-2 text-xl font-semibold tracking-tight">Data and AI</h2>
              </div>
              <Question question="How does Proofstack separate facts from interpretation?">
                <p>GitHub metadata is treated as repository evidence, project briefs are owner-authored statements, and generated summaries are AI interpretation. Generated content is labeled and should be reviewed rather than treated as verified fact.</p>
              </Question>
              <Question question="How are private repositories handled?">
                <p>Private repository access is optional and requires a separate GitHub authorization. Even after connecting private repositories, AI processing stays off for each private project until you explicitly enable it. Private repositories and raw private evidence are never included in public profiles.</p>
              </Question>
              <Question question="What is sent to the AI provider?">
                <p>Public repository metadata and your notes can be used when you request AI features. Private repository content is sent only for projects where you enabled AI processing. See <Link href="/privacy" className="text-brand underline-offset-2 hover:underline">Privacy and data use</Link> for the full data boundary.</p>
              </Question>
            </section>

            <section id="public-profiles" aria-labelledby="public-profiles-heading" className="scroll-mt-8 space-y-5">
              <div>
                <p className="eyebrow text-brand">03</p>
                <h2 id="public-profiles-heading" className="mt-2 text-xl font-semibold tracking-tight">Public profiles</h2>
              </div>
              <Question question="What becomes public when I publish?">
                <p>Only non-private projects and project-brief fields you selected can appear. You control the profile URL, which projects and fields are visible, and whether to publish a snapshot of your latest portfolio briefing. Changes remain private until you publish them.</p>
              </Question>
              <Question question="What is an automated preview?">
                <p>If a GitHub user has not published a Proofstack profile, a visitor can request a temporary, clearly labeled preview based only on public GitHub data. It is not owner reviewed, is cached for up to 24 hours, and can be disabled for your GitHub username from the Account page.</p>
              </Question>
              <Question question="Can a private project appear publicly?">
                <p>No. Private repositories are excluded from public profiles and public chat, even when private AI processing is enabled for your own workspace.</p>
              </Question>
            </section>

            <section id="troubleshooting" aria-labelledby="troubleshooting-heading" className="scroll-mt-8 space-y-5">
              <div>
                <p className="eyebrow text-brand">04</p>
                <h2 id="troubleshooting-heading" className="mt-2 text-xl font-semibold tracking-tight">Troubleshooting and account controls</h2>
              </div>
              <Question question="Why is a repository missing?">
                <p>Run sync again first. Private repositories appear only after you connect private repository access. A repository deleted or no longer visible on GitHub is hidden from Proofstack surfaces without deleting the owner context already stored for it, so that context can return if the repository becomes visible again.</p>
              </Question>
              <Question question="Why does README evidence look stale?">
                <p>Proofstack records which repository revision an indexed README came from. Re-index the project after its README changes to refresh that evidence before relying on generated answers.</p>
              </Question>
              <Question question="How do I delete my data?">
                <p>Open the <Link href="/account" className="text-brand underline-offset-2 hover:underline">Account page</Link> and use Delete account. This removes your profile, projects, briefs, briefings, embeddings, and stored GitHub credential.</p>
              </Question>
              <Question question="Where can I report a problem?">
                <p>Open an issue in the <a href="https://github.com/jrudman25/Repfolio" target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">Proofstack source repository<span className="sr-only"> (opens in a new tab)</span></a> with the steps you followed and the visible error message. Do not include access tokens, private repository content, or other secrets.</p>
              </Question>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
