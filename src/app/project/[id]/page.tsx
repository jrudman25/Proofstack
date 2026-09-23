import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import ProjectDetailClient from '@/components/ProjectDetailClient'
import { Logo } from '@/components/icons/Logo'
import { UUID_PATTERN } from '@/lib/api-validation'

const PROJECT_COLUMNS = 'id, user_id, github_repo_id, name, full_name, description, html_url, language, homepage, stargazers_count, pushed_at, github_created_at, is_private, ai_opt_in, github_fork, github_owner_login, github_owner_type, technologies, has_code_map, github_deleted_at, created_at, updated_at'

function LoadError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-sans">
      <div className="corner-ticks relative w-full max-w-md border border-line bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Unable to load this project</h1>
        <p className="mt-3 text-sm leading-relaxed text-dim">{message} Your data is safe; try again in a moment.</p>
        <Link href="/" className="eyebrow mt-6 inline-flex items-center gap-2 border border-line px-4 py-2 text-dim transition-colors hover:border-line-bright hover:text-foreground">
          <Logo className="h-3.5 w-3.5 text-brand" />
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!UUID_PATTERN.test(id)) {
    notFound()
  }

  // Distinguish a failed read from a confirmed absence: dependency failures
  // render a recoverable error rather than an empty or redirected page.
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .is('github_deleted_at', null)
    .maybeSingle()

  if (projectError) {
    console.error('Error fetching project')
    return <LoadError message="The project record could not be read." />
  }

  if (!project || project.user_id !== user.id) {
    notFound()
  }

  const [briefResult, embeddingResult] = await Promise.all([
    supabase.from('project_briefs').select('*').eq('project_id', id).maybeSingle(),
    supabase.from('project_embeddings').select('metadata').eq('project_id', id).eq('source', 'readme').maybeSingle(),
  ])

  return (
    <ProjectDetailClient
      project={project}
      initialBrief={briefResult.data}
      briefLoadFailed={Boolean(briefResult.error)}
      readmeIndexedPushedAt={typeof embeddingResult.data?.metadata?.pushed_at === 'string' ? embeddingResult.data.metadata.pushed_at : null}
      readmeIndexExists={Boolean(embeddingResult.data)}
    />
  )
}
