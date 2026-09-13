import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch projects for this user
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('pushed_at', { ascending: false })

  if (error) {
    console.error('Error fetching projects:', error)
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)

  return (
    <Dashboard
      initialProjects={projects || []}
      user={{
        handle: str(meta?.user_name) ?? str(meta?.preferred_username),
        displayName: str(meta?.full_name) ?? str(meta?.name) ?? str(user.email),
        avatarUrl: str(meta?.avatar_url),
      }}
    />
  )
}
