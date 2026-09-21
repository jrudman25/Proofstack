import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AccountClient from '@/components/AccountClient'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: briefingRow }] = await Promise.all([
    supabase.from('profiles')
      .select('public_slug, profile_published, profile_published_at, public_briefing_published_at')
      .eq('id', user.id).maybeSingle(),
    supabase.from('portfolio_briefings').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])

  return (
    <AccountClient
      email={user.email ?? null}
      publication={{
        slug: profile?.public_slug ?? null,
        published: profile?.profile_published ?? false,
        briefingPublishedAt: profile?.public_briefing_published_at ?? null,
        hasBriefing: Boolean(briefingRow),
      }}
    />
  )
}
