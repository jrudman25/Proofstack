import type { MetadataRoute } from 'next'
import { getAppUrl } from '@/lib/env-public'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  const origin = getAppUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/account', '/project/', '/auth/'],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
