import { createHash } from 'node:crypto'
import { ApiError } from '@/lib/api-validation'
import { readBodyBytes } from '@/lib/read-body'
import { createRedis, redisKey, type UserContext } from '@/lib/redis'

export type GithubIdentity = UserContext & { accessToken: string | undefined }
export const MAX_GITHUB_PAGES = 50
const MAX_PACKAGE_BYTES = 256 * 1024
const PACKAGE_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const
export type GithubRepo = {
  id: number; name: string; full_name: string; description: string | null
  html_url: string; language: string | null; homepage: string | null
  stargazers_count: number; pushed_at: string | null
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
    const nullableText = (v: unknown) => v === null || typeof v === 'string'
    if (!Number.isSafeInteger(r.id) || (r.id as number) < 1
      || typeof r.name !== 'string' || !/^[\w.-]+$/.test(r.name) || r.name === '.' || r.name === '..'
      || typeof r.full_name !== 'string' || !/^[\w-]+\/[\w.-]+$/.test(r.full_name) || r.full_name.split('/')[1] !== r.name
      || !nullableText(r.description) || !nullableText(r.language) || !nullableText(r.homepage)
      || !Number.isSafeInteger(r.stargazers_count) || (r.stargazers_count as number) < 0
      || !(r.pushed_at === null || (typeof r.pushed_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.pushed_at) && Number.isFinite(Date.parse(r.pushed_at))))
      || r.html_url !== `https://github.com/${r.full_name}`) unavailable()
    if (r.homepage) {
      try { if (!['https:', 'http:'].includes(new URL(r.homepage as string).protocol)) unavailable() } catch { unavailable() }
    }
    return { id: r.id, name: r.name, full_name: r.full_name, description: r.description,
      html_url: r.html_url, language: r.language, homepage: r.homepage,
      stargazers_count: r.stargazers_count, pushed_at: r.pushed_at } as GithubRepo
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

export async function fetchGithubPackageDependencies(owner: string, repo: string, identity: GithubIdentity): Promise<string[] | null> {
  try {
    if (!validRepositoryPath(owner, repo) || !identity.accessToken?.trim()) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-package', owner, repo)
    const cached = await redis.get(key)
    if (cached !== null) return parsePackageCache(cached)
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json`, {
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

export async function fetchGithubReadme(owner: string, repo: string, identity: GithubIdentity): Promise<string | null> {
  try {
    if (!validRepositoryPath(owner, repo)) unavailable()
    const redis = createRedis()
    const key = cacheKey(identity, 'github-readme', owner, repo)
    const cached = await redis.get(key)
    if (cached !== null) {
      if (typeof cached !== 'string' || Buffer.byteLength(cached, 'utf8') > 1024 * 1024) unavailable()
      return cached
    }
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
      headers: headers(identity, 'application/vnd.github.raw'), redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      if (res.status === 404) return null
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
