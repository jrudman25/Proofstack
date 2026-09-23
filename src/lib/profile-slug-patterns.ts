// Shared slug shapes for routing public profiles. This module must stay
// dependency-free: it is pulled into the proxy bundle, so it cannot import
// server-only or Node-built-in modules.

// GitHub usernames: up to 39 characters, alphanumeric or single hyphens, never
// leading or trailing hyphens. Case-insensitive; callers normalize to lower.
export const GITHUB_USERNAME_PATTERN = /^[a-z0-9](?:-?[a-z0-9]){0,38}$/

// Published profile slugs allow consecutive inner hyphens (GitHub usernames do
// not), same length bounds.
export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$/

export function isRoutableProfileSlug(slug: string): boolean {
  const normalized = slug.toLowerCase()
  return GITHUB_USERNAME_PATTERN.test(normalized) || PUBLIC_SLUG_PATTERN.test(normalized)
}
