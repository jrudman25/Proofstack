import { NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/api-auth'
import { ApiError, apiErrorResponse, objectBody, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { PUBLIC_SLUG_PATTERN, buildPublicBriefingSnapshot } from '@/lib/public-profile'
import type { PortfolioBriefing } from '@/types'

const PROFILE_FIELDS = 'public_slug, profile_published, profile_published_at, public_briefing_published_at'

// Owner publication controls. Publishing copies the current briefing into a
// public snapshot so regenerating the private briefing can never silently
// change published content; unpublishing keeps the snapshot so re-publishing
// is instant. The public slug is stable and owner-editable.
export async function PATCH(request: Request) {
  try {
    const auth = await authenticateUser()
    const body = objectBody(await readJsonBody(request, 4096))
    const allowed = new Set(['slug', 'published', 'publishBriefing'])
    const keys = Object.keys(body)
    if (!keys.length || keys.some(key => !allowed.has(key))) throw new ApiError(400, 'Invalid profile settings')

    let slug: string | undefined
    if ('slug' in body) {
      if (typeof body.slug !== 'string') throw new ApiError(400, 'Invalid profile settings')
      slug = body.slug.trim().toLowerCase()
      if (!PUBLIC_SLUG_PATTERN.test(slug)) {
        throw new ApiError(400, 'Profile URLs use lowercase letters, numbers, and hyphens')
      }
    }
    if ('published' in body && typeof body.published !== 'boolean') throw new ApiError(400, 'Invalid profile settings')
    if ('publishBriefing' in body && body.publishBriefing !== true) throw new ApiError(400, 'Invalid profile settings')

    await enforceRateLimit(auth, 'account')

    const now = new Date().toISOString()
    const update: Record<string, unknown> = {}
    if (slug !== undefined) update.public_slug = slug
    if (typeof body.published === 'boolean') {
      update.profile_published = body.published
      update.profile_published_at = body.published ? now : null
    }
    if (body.publishBriefing === true) {
      const { data: row, error } = await auth.supabase.from('portfolio_briefings')
        .select('briefing').eq('user_id', auth.userId).maybeSingle()
      if (error) throw new ApiError(503, 'Service temporarily unavailable')
      if (!row?.briefing) throw new ApiError(400, 'Generate a portfolio briefing before publishing it')
      update.public_briefing = buildPublicBriefingSnapshot(row.briefing as PortfolioBriefing)
      update.public_briefing_published_at = now
    }

    // Publishing needs a reachable URL: either a slug in this request or one
    // already stored on the profile.
    if (body.published === true && update.public_slug === undefined) {
      const { data: existing, error } = await auth.supabase.from('profiles')
        .select('public_slug').eq('id', auth.userId).maybeSingle()
      if (error) throw new ApiError(503, 'Service temporarily unavailable')
      if (!existing?.public_slug) throw new ApiError(400, 'Choose a profile URL before publishing')
    }

    const { data: profile, error } = await auth.supabase.from('profiles')
      .update(update).eq('id', auth.userId).select(PROFILE_FIELDS).maybeSingle()
    if (error) {
      if (error.code === '23505') throw new ApiError(409, 'That profile URL is already taken')
      throw new ApiError(503, 'Service temporarily unavailable')
    }
    if (!profile) throw new ApiError(503, 'Service temporarily unavailable')
    return NextResponse.json({ profile })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
