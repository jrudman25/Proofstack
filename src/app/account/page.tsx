import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AccountClient, { type PublicationProject } from '@/components/AccountClient'

type PublicationRow = {
  id: string
  name: string
  is_private: boolean | null
  project_briefs: { visibility: string | null; published_fields: string[] | null } | { visibility: string | null; published_fields: string[] | null }[] | null
}

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: briefingRow }, projectsResult] = await Promise.all([
    supabase.from('profiles')
      .select('public_slug, profile_published, profile_published_at, public_briefing_published_at, unclaimed_analysis_opt_out')
      .eq('id', user.id).maybeSingle(),
    supabase.from('portfolio_briefings').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('projects')
      .select('id, name, is_private, project_briefs(visibility, published_fields)')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
  ])

  if (projectsResult.error) console.error('Error fetching publication projects')

  const publicationProjects: PublicationProject[] = ((projectsResult.data || []) as PublicationRow[]).map(row => {
    const brief = Array.isArray(row.project_briefs) ? row.project_briefs[0] : row.project_briefs
    return {
      id: row.id,
      name: row.name,
      isPrivate: row.is_private === true,
      visibility: brief?.visibility === 'public' ? 'public' : 'private',
      publishedFields: Array.isArray(brief?.published_fields) ? brief.published_fields.filter(field => typeof field === 'string') : [],
    }
  })

  return (
    <AccountClient
      email={user.email ?? null}
      publication={{
        slug: profile?.public_slug ?? null,
        published: profile?.profile_published ?? false,
        briefingPublishedAt: profile?.public_briefing_published_at ?? null,
        hasBriefing: Boolean(briefingRow),
        unclaimedAnalysisOptOut: profile?.unclaimed_analysis_opt_out ?? false,
      }}
      publicationProjects={publicationProjects}
      publicationProjectsFailed={Boolean(projectsResult.error)}
    />
  )
}
