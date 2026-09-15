import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'
import { briefingChangedCount } from '@/lib/portfolio-briefing'
import type { DashboardProject, PortfolioBriefing, StoredBriefing } from '@/types'

// Only the columns the dashboard renders; internal identifiers and legacy
// fields are not shipped to the client bundle.
const DASHBOARD_PROJECT_COLUMNS = 'id, name, full_name, description, html_url, language, homepage, stargazers_count, pushed_at, github_created_at, is_private, ai_opt_in, technologies, created_at, updated_at'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [projectResult, profileResult, briefingResult] = await Promise.all([
    supabase
      .from('projects')
      .select(`${DASHBOARD_PROJECT_COLUMNS}, project_briefs(purpose, lifecycle_status, owner_verified_at)`)
      .eq('user_id', user.id)
      .order('pushed_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('last_catalog_sync_at, github_private_scope')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('portfolio_briefings')
      .select('briefing, generated_at, evidence')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const meta = user.user_metadata as Record<string, unknown> | undefined
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)
  const dashboardUser = {
    handle: str(meta?.user_name) ?? str(meta?.preferred_username),
    displayName: str(meta?.full_name) ?? str(meta?.name) ?? str(user.email),
    avatarUrl: str(meta?.avatar_url),
  }

  // A failed read must never render as an empty portfolio: an empty list is
  // only shown when the read confirmed zero rows.
  if (projectResult.error) {
    console.error('Error fetching projects')
    return <Dashboard loadError initialProjects={[]} user={dashboardUser} />
  }

  const rows = (projectResult.data || []) as (Record<string, unknown> & { project_briefs?: unknown })[]
  const projects: DashboardProject[] = rows.map(({ project_briefs, ...project }) => ({
    ...project,
    brief: (Array.isArray(project_briefs) ? project_briefs[0] : project_briefs) as DashboardProject['brief'] ?? null,
  })) as DashboardProject[]

  let initialBriefing: StoredBriefing | null = null
  const briefingRow = briefingResult.data
  if (briefingRow?.briefing && typeof briefingRow.generated_at === 'string') {
    initialBriefing = {
      briefing: briefingRow.briefing as PortfolioBriefing,
      generatedAt: briefingRow.generated_at,
      changedCount: briefingChangedCount(briefingRow.evidence, projects),
    }
  }

  return (
    <Dashboard
      initialProjects={projects}
      user={dashboardUser}
      lastSyncedAt={profileResult.data?.last_catalog_sync_at ?? null}
      privateReposConnected={profileResult.data?.github_private_scope === true}
      initialBriefing={initialBriefing}
    />
  )
}
