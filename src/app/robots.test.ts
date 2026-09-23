import { afterEach, expect, it, vi } from 'vitest'
import robots from './robots'

afterEach(() => vi.unstubAllEnvs())

it('allows the app root, excludes machine and owner surfaces, and references the sitemap', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://proofstack.example.com')
  const result = robots()
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
  expect(rules).toContainEqual({ userAgent: '*', allow: '/', disallow: ['/api/', '/account', '/project/', '/auth/'] })
  const disallowed = rules.flatMap(rule => Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow])
  expect(disallowed).not.toContain('/u/')
  expect(result.sitemap).toBe('https://proofstack.example.com/sitemap.xml')
})
