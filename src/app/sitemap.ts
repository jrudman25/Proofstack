import type { MetadataRoute } from 'next'
import { getAppUrl } from '@/lib/env-public'
import { getPublishedProfileSlugs } from '@/lib/public-profile'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getAppUrl()
  const slugs = await getPublishedProfileSlugs()
  return [
    { url: origin, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/help`, changeFrequency: 'monthly', priority: 0.6 },
    ...slugs.map(slug => ({
      url: `${origin}/u/${encodeURIComponent(slug)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
