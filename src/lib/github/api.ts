import { createHash } from 'node:crypto'
import { ApiError } from '@/lib/api-validation'
import { readBodyBytes } from '@/lib/read-body'
import { createRedis, redisKey, type UserContext } from '@/lib/redis'

export type GithubIdentity = UserContext & { accessToken: string | undefined }
export const MAX_GITHUB_PAGES = 50
const MAX_PACKAGE_BYTES = 256 * 1024
const PACKAGE_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const
export type GithubDirectoryEntry = { name: string; type: 'file' | 'dir' | 'symlink' | 'submodule' }
export type GithubRepo = {
  id: number; name: string; full_name: string; description: string | null
  html_url: string; language: string | null; homepage: string | null
  stargazers_count: number; pushed_at: string | null
  is_private: boolean; github_created_at: string | null
  github_fork: boolean; github_owner_login: string; github_owner_type: 'User' | 'Organization' | null
}

function unavailable(): never { throw new ApiError(503, 'GitHub service temporarily unavailable') }
function cacheKey(identity: GithubIdentity, purpose: string, ...parts: string[]) {
  const authorization = identity.accessToken === undefined ? ['anonymous'] : ['bearer', identity.accessToken]
  return redisKey(identity, purpose, createHash('sha256').update(JSON.stringify(authorization)).digest('hex'), ...parts)
}
function headers(identity: GithubIdentity, accept: string): Record<string, string> {
  return {
    Accept: accept, 'User-Agent': 'repolio', 'X-GitHub-Api-Version': '2022-11-28',
    ...(identity.accessToken ? { Authorization: `Bearer ${identity.accessToken}` } : {}),
  }
}
function validRepositoryPath(owner: string, repo: string) {
  return typeof owner === 'string' && typeof repo === 'string' && /^[\w-]+$/.test(owner)
    && /^[\w.-]+$/.test(repo) && repo !== '.' && repo !== '..'
}
function validateNameList(value: unknown, maxCount: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxCount
    || value.some(name => typeof name !== 'string' || name.length < 1 || name.length > maxLength)) unavailable()
  return value as string[]
}
function validateDependencyNames(value: unknown) {
  return validateNameList(value, 2000, 214)
}
function parsePackageDependencies(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const manifest = value as Record<string, unknown>
  const dependencies = new Set<string>()
  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const section = manifest[field]
    if (section === undefined) continue
    if (!section || typeof section !== 'object' || Array.isArray(section)) unavailable()
    const entries = Object.entries(section)
    if (entries.length > 2000 || entries.some(([name, version]) => name.length > 214 || typeof version !== 'string')) unavailable()
    for (const [name] of entries) dependencies.add(name)
  }
  return validateDependencyNames(Array.from(dependencies))
}
function parsePackageCache(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const cached = value as Record<string, unknown>
  if (cached.found === false && Array.isArray(cached.dependencies) && cached.dependencies.length === 0) return null
  if (cached.found !== true) unavailable()
  return validateDependencyNames(cached.dependencies)
}
function parseRepos(value: unknown, limit: number): GithubRepo[] {
  if (!Array.isArray(value) || value.length > limit) unavailable()
  return value.map((repo: unknown) => {
    if (!repo || typeof repo !== 'object' || Array.isArray(repo)) unavailable()
    const r = repo as Record<string, unknown>
    // Cache entries hold the parsed shape (is_private/github_created_at);
    // live API payloads use GitHub's raw names (private/created_at).
    const isPrivate = r.private ?? r.is_private
    const createdAt = r.created_at ?? r.github_created_at
    // Repository relationship: live payloads carry fork and owner.{login,type};
    // cached entries hold the parsed storage names. Owner login is always
    // derivable from full_name; an unrecognized owner type is dropped to null
    // rather than aborting the import.
    const fork = r.fork ?? r.github_fork ?? false
    const owner = (r.owner && typeof r.owner === 'object' && !Array.isArray(r.owner) ? r.owner : {}) as Record<string, unknown>
    const ownerLogin = owner.login ?? r.github_owner_login ?? (typeof r.full_name === 'string' ? r.full_name.split('/')[0] : undefined)
    const rawOwnerType = owner.type ?? r.github_owner_type
    const ownerType = rawOwnerType === 'User' || rawOwnerType === 'Organization' ? rawOwnerType : null
    const nullableText = (v: unknown) => v === null || typeof v === 'string'
    if (!Number.isSafeInteger(r.id) || (r.id as number) < 1
      || typeof r.name !== 'string' || !/^[\w.-]+$/.test(r.name) || r.name === '.' || r.name === '..'
      || typeof r.full_name !== 'string' || !/^[\w-]+\/[\w.-]+$/.test(r.full_name) || r.full_name.split('/')[1] !== r.name
      || !nullableText(r.description) || !nullableText(r.language) || !nullableText(r.homepage)
      || !Number.isSafeInteger(r.stargazers_count) || (r.stargazers_count as number) < 0
      || !(r.pushed_at === null || (typeof r.pushed_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.pushed_at) && Number.isFinite(Date.parse(r.pushed_at))))
      || !(createdAt === null || (typeof createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(createdAt) && Number.isFinite(Date.parse(createdAt))))
      || typeof isPrivate !== 'boolean'
      || typeof fork !== 'boolean'
      || typeof ownerLogin !== 'string' || !/^[\w-]+$/.test(ownerLogin)
      || r.html_url !== `https://github.com/${r.full_name}`) unavailable()
    if (r.homepage) {
      try { if (!['https:', 'http:'].includes(new URL(r.homepage as string).protocol)) unavailable() } catch { unavailable() }
    }
    return { id: r.id, name: r.name, full_name: r.full_name, description: r.description,
      html_url: r.html_url, language: r.language, homepage: r.homepage,
      stargazers_count: r.stargazers_count, pushed_at: r.pushed_at,
      is_private: isPrivate, github_created_at: createdAt,
      github_fork: fork, github_owner_login: ownerLogin, github_owner_type: ownerType } as GithubRepo
  })
}

export async function fetchGithubRepos(identity: GithubIdentity): Promise<GithubRepo[]> {
  try {
    if (!identity.accessToken?.trim()) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-repos')
    // Try to get from cache first
    const cached = await redis.get(key)
    if (cached !== null) return parseRepos(cached, MAX_GITHUB_PAGES * 100)

    // Fetch from GitHub
    const repos = new Map<number, GithubRepo>()
    const traversalSignal = AbortSignal.timeout(60_000)
    for (let page = 1; page <= MAX_GITHUB_PAGES; page++) {
      traversalSignal.throwIfAborted()
      const res = await fetch(`https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`, {
        headers: headers(identity, 'application/vnd.github+json'), redirect: 'error',
        signal: AbortSignal.any([traversalSignal, AbortSignal.timeout(15_000)]),
      })
      if (!res.ok) unavailable()
      const bytes = await readBodyBytes(res, 2 * 1024 * 1024)
      const batch = parseRepos(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), 100)
      for (const repo of batch) repos.set(repo.id, repo)
      if (batch.length < 100) {
        const data = [...repos.values()]
        // Cache for 1 hour to prevent rate limiting
        await redis.set(key, data, { ex: 3600 })
        return data
      }
    }
    throw new ApiError(503, 'GitHub repository pagination limit reached; sync was not started')
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}

// Returns the OAuth scopes granted to the current token, or null when the
// probe fails. Scope detection is bookkeeping: a null result must never fail
// a sync, it only leaves the recorded capability unchanged.
export async function fetchGithubTokenScopes(identity: GithubIdentity): Promise<string[] | null> {
  try {
    if (!identity.accessToken?.trim()) return null
    const redis = createRedis()
    const key = cacheKey(identity, 'github-token-scopes')
    const cached = await redis.get(key)
    if (cached !== null) {
      if (!Array.isArray(cached) || cached.length > 50
        || cached.some(scope => typeof scope !== 'string' || scope.length > 100)) return null
      return cached as string[]
    }
    const res = await fetch('https://api.github.com/user', {
      headers: headers(identity, 'application/vnd.github+json'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const scopes = (res.headers.get('x-oauth-scopes') || '').split(',').map(scope => scope.trim()).filter(Boolean)
    await redis.set(key, scopes, { ex: 3600 })
    return scopes
  } catch {
    return null
  }
}

function validPackageManifestPath(path: string) {
  if (path === 'package.json') return true
  return /^(apps|packages|services)\/[^/]+\/package\.json$/.test(path)
    && !path.split('/').some(segment => segment === '.' || segment === '..')
}

export async function fetchGithubPackageDependencies(owner: string, repo: string, identity: GithubIdentity, path = 'package.json'): Promise<string[] | null> {
  try {
    if (!validRepositoryPath(owner, repo) || !validPackageManifestPath(path) || !identity.accessToken?.trim()) unavailable()
    const redis = createRedis()
    const key = path === 'package.json'
      ? cacheKey(identity, 'github-package', owner, repo)
      : cacheKey(identity, 'github-package', owner, repo, path)
    const cached = await redis.get(key)
    if (cached !== null) return parsePackageCache(cached)
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`, {
      headers: headers(identity, 'application/vnd.github.raw'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) {
      await redis.set(key, { found: false, dependencies: [] }, { ex: 3600 })
      return null
    }
    if (!res.ok) unavailable()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readBodyBytes(res, MAX_PACKAGE_BYTES))
    const dependencies = parsePackageDependencies(JSON.parse(text))
    await redis.set(key, { found: true, dependencies }, { ex: 3600 })
    return dependencies
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}

const MAX_LANGUAGES = 50
const MAX_ROOT_ENTRIES = 1000

function parseLanguages(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MAX_LANGUAGES
    || entries.some(([, bytes]) => !Number.isFinite(bytes) || (bytes as number) < 0)) unavailable()
  // The API returns a language-to-byte-count map; order by size so dominant
  // languages lead the stored list.
  entries.sort((a, b) => (b[1] as number) - (a[1] as number))
  return validateNameList(entries.map(([name]) => name), MAX_LANGUAGES, 100)
}
function parseLanguagesCache(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const cached = value as Record<string, unknown>
  if (cached.found === false && Array.isArray(cached.languages) && cached.languages.length === 0) return null
  if (cached.found !== true) unavailable()
  return validateNameList(cached.languages, MAX_LANGUAGES, 100)
}
export async function fetchGithubRepoLanguages(owner: string, repo: string, identity: GithubIdentity): Promise<string[] | null> {
  try {
    if (!validRepositoryPath(owner, repo) || !identity.accessToken?.trim()) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-languages', owner, repo)
    const cached = await redis.get(key)
    if (cached !== null) return parseLanguagesCache(cached)
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`, {
      headers: headers(identity, 'application/vnd.github+json'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) {
      await redis.set(key, { found: false, languages: [] }, { ex: 3600 })
      return null
    }
    if (!res.ok) unavailable()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readBodyBytes(res, MAX_PACKAGE_BYTES))
    const languages = parseLanguages(JSON.parse(text))
    await redis.set(key, { found: true, languages }, { ex: 3600 })
    return languages
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}

function parseRootEntries(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_ROOT_ENTRIES) unavailable()
  return validateNameList(value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) unavailable()
    return (entry as Record<string, unknown>).name
  }), MAX_ROOT_ENTRIES, 255)
}
function parseRootEntriesCache(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const cached = value as Record<string, unknown>
  if (cached.found === false && Array.isArray(cached.names) && cached.names.length === 0) return null
  if (cached.found !== true) unavailable()
  return validateNameList(cached.names, MAX_ROOT_ENTRIES, 255)
}
// Returns the names of a repository's root directory entries (files and
// directories). A null result means the repository is empty or no longer
// accessible.
export async function fetchGithubRootEntries(owner: string, repo: string, identity: GithubIdentity): Promise<string[] | null> {
  try {
    if (!validRepositoryPath(owner, repo) || !identity.accessToken?.trim()) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-root-entries', owner, repo)
    const cached = await redis.get(key)
    if (cached !== null) return parseRootEntriesCache(cached)
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`, {
      headers: headers(identity, 'application/vnd.github+json'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) {
      await redis.set(key, { found: false, names: [] }, { ex: 3600 })
      return null
    }
    if (!res.ok) unavailable()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readBodyBytes(res, 2 * 1024 * 1024))
    const names = parseRootEntries(JSON.parse(text))
    await redis.set(key, { found: true, names }, { ex: 3600 })
    return names
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}

const DIRECTORY_ENTRY_TYPES = ['file', 'dir', 'symlink', 'submodule'] as const

function parseDirectoryEntries(value: unknown): GithubDirectoryEntry[] {
  if (!Array.isArray(value) || value.length > MAX_ROOT_ENTRIES) unavailable()
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) unavailable()
    const e = entry as Record<string, unknown>
    if (typeof e.name !== 'string' || e.name.length < 1 || e.name.length > 255
      || e.name.includes('/') || e.name === '.' || e.name === '..'
      || !DIRECTORY_ENTRY_TYPES.includes(e.type as GithubDirectoryEntry['type'])) unavailable()
    return { name: e.name, type: e.type as GithubDirectoryEntry['type'] }
  })
}
function parseDirectoryEntriesCache(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const cached = value as Record<string, unknown>
  if (cached.found === false && Array.isArray(cached.entries) && cached.entries.length === 0) return null
  if (cached.found !== true) unavailable()
  return parseDirectoryEntries(cached.entries)
}
export async function fetchGithubDirectoryEntries(owner: string, repo: string, directory: 'apps' | 'packages' | 'services', identity: GithubIdentity): Promise<GithubDirectoryEntry[] | null> {
  try {
    if (!validRepositoryPath(owner, repo) || !identity.accessToken?.trim()) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-directory', owner, repo, directory)
    const cached = await redis.get(key)
    if (cached !== null) return parseDirectoryEntriesCache(cached)
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(directory)}`, {
      headers: headers(identity, 'application/vnd.github+json'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) {
      await redis.set(key, { found: false, entries: [] }, { ex: 3600 })
      return null
    }
    if (!res.ok) unavailable()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readBodyBytes(res, 2 * 1024 * 1024))
    const entries = parseDirectoryEntries(JSON.parse(text))
    await redis.set(key, { found: true, entries }, { ex: 3600 })
    return entries
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}

export async function fetchGithubReadme(owner: string, repo: string, identity: GithubIdentity): Promise<string | null> {
  try {
    if (!validRepositoryPath(owner, repo)) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-readme', owner, repo)
    const cached = await redis.get(key)
    if (cached !== null) {
      // Missing READMEs are cached as a marker object for one hour, like the
      // sibling fetchers; stored READMEs remain plain strings.
      if (typeof cached === 'object' && !Array.isArray(cached)
        && (cached as Record<string, unknown>).found === false) return null
      if (typeof cached !== 'string' || Buffer.byteLength(cached, 'utf8') > 1024 * 1024) unavailable()
      return cached
    }
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
      headers: headers(identity, 'application/vnd.github.raw'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      if (res.status === 404) {
        await redis.set(key, { found: false }, { ex: 3600 })
        return null
      }
      unavailable()
    }
    const data = new TextDecoder('utf-8', { fatal: true }).decode(await readBodyBytes(res, 1024 * 1024))
    // Cache for 24 hours
    await redis.set(key, data, { ex: 86400 })
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}

// GitHub usernames: up to 39 characters, alphanumeric or single hyphens, never
// leading or trailing hyphens. Case-insensitive; callers normalize to lower.
export const GITHUB_USERNAME_PATTERN = /^[a-z0-9](?:-?[a-z0-9]){0,38}$/

export type GithubPublicUser = {
  login: string
  name: string | null
  avatar_url: string | null
  bio: string | null
  public_repos: number
  created_at: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

function parsePublicUser(value: unknown): GithubPublicUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const user = value as Record<string, unknown>
  const avatar = user.avatar_url
  if (typeof user.login !== 'string' || !GITHUB_USERNAME_PATTERN.test(user.login)
    || !(user.name === null || typeof user.name === 'string')
    || !(user.bio === null || typeof user.bio === 'string')
    || !(avatar === null || (typeof avatar === 'string' && avatar.startsWith('https://')))
    || !Number.isSafeInteger(user.public_repos) || (user.public_repos as number) < 0
    || !(user.created_at === null || (typeof user.created_at === 'string' && ISO_DATE.test(user.created_at)))) unavailable()
  return {
    login: user.login, name: user.name as string | null,
    avatar_url: user.avatar_url as string | null, bio: user.bio as string | null,
    public_repos: user.public_repos as number, created_at: user.created_at as string | null,
  }
}

function parsePublicUserCache(value: unknown): GithubPublicUser | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
  const cached = value as Record<string, unknown>
  if (cached.found === false) return null
  if (cached.found !== true) unavailable()
  return parsePublicUser(cached.user)
}

// Public profile lookups run unauthenticated: the identity carries no token
// and the cache is shared across visitors for the same username.
export async function fetchGithubPublicUser(username: string, identity: GithubIdentity): Promise<GithubPublicUser | null> {
  try {
    if (!GITHUB_USERNAME_PATTERN.test(username)) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-public-user', username)
    const cached = await redis.get(key)
    if (cached !== null) return parsePublicUserCache(cached)
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: headers(identity, 'application/vnd.github+json'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) {
      await redis.set(key, { found: false }, { ex: 86400 })
      return null
    }
    if (!res.ok) unavailable()
    const user = parsePublicUser(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBodyBytes(res, 256 * 1024))))
    await redis.set(key, { found: true, user }, { ex: 86400 })
    return user
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}

// Public repository list for an arbitrary GitHub user: one page of at most
// 100 repositories sorted by last push, cached for 24 hours.
export async function fetchGithubUserRepos(username: string, identity: GithubIdentity): Promise<GithubRepo[] | null> {
  try {
    if (!GITHUB_USERNAME_PATTERN.test(username)) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-public-repos', username)
    const cached = await redis.get(key)
    if (cached !== null) {
      if (cached && typeof cached === 'object' && !Array.isArray(cached)
        && (cached as Record<string, unknown>).found === false) return null
      return parseRepos(cached, 100)
    }
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`, {
      headers: headers(identity, 'application/vnd.github+json'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) {
      await redis.set(key, { found: false }, { ex: 86400 })
      return null
    }
    if (!res.ok) unavailable()
    const repos = parseRepos(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBodyBytes(res, 4 * 1024 * 1024))), 100)
    await redis.set(key, repos, { ex: 86400 })
    return repos
  } catch (error) {
    if (error instanceof ApiError) throw error
    unavailable()
  }
}
