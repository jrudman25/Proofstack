import { NextResponse } from 'next/server'
import { authenticateUser, getProviderToken } from '@/lib/api-auth'
import { apiErrorResponse, objectBody, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { fetchGithubDirectoryEntries, fetchGithubPackageDependencies, fetchGithubRepoLanguages, fetchGithubRepos, fetchGithubRootEntries, fetchGithubTokenScopes, type GithubRepo } from '@/lib/github/api'
import { mergeTechnologies, normalizeTechnology, technologiesFromPackageDependencies } from '@/lib/package-technologies'
import { technologiesFromManifestFiles } from '@/lib/manifest-technologies'

const MANIFEST_BATCH_SIZE = 10
const WORKSPACE_ROOTS = ['apps', 'packages', 'services'] as const
const MAX_WORKSPACE_MANIFESTS = 12
// The repository-list traversal has its own 60-second budget inside
// fetchGithubRepos; enrichment gets a separate bound so a slow provider or a
// large cold-cache portfolio cannot stall the whole import.
const ENRICHMENT_BUDGET_MS = 45_000

type ExistingProject = { github_repo_id: number; technologies: string[] | null; is_private: boolean }
type IndexedRepo = GithubRepo & { technologies: string[] }

async function fetchWorkspaceDependencies(owner: string, repo: string, files: string[] | null, identity: { userId: string; accessToken: string }) {
  const roots = files ? WORKSPACE_ROOTS.filter(root => files.includes(root)) : []
  if (!roots.length) return { dependencies: [] as string[], found: false }
  const listings = await Promise.all(roots.map(root => fetchGithubDirectoryEntries(owner, repo, root, identity)))
  const manifests: string[] = []
  for (const [index, root] of roots.entries()) {
    const names = (listings[index] || [])
      .filter(entry => entry.type === 'dir')
      .map(entry => entry.name)
      .sort()
    for (const name of names) manifests.push(`${root}/${name}/package.json`)
  }
  const results = await Promise.all(manifests.slice(0, MAX_WORKSPACE_MANIFESTS)
    .map(path => fetchGithubPackageDependencies(owner, repo, identity, path)))
  return {
    dependencies: results.flatMap(dependencies => dependencies ?? []),
    found: results.some(dependencies => dependencies !== null),
  }
}

async function enrichRepository(repo: GithubRepo, existing: Map<number, string[]>, userId: string, accessToken: string) {
  const identity = { userId, accessToken }
  const [owner] = repo.full_name.split('/')
  const [files, languages] = await Promise.all([
    fetchGithubRootEntries(owner, repo.name, identity),
    fetchGithubRepoLanguages(owner, repo.name, identity),
  ])
  // The root listing tells us whether package.json exists, so non-JS
  // repositories skip an extra request that would 404.
  const rootDependencies = files?.includes('package.json')
    ? await fetchGithubPackageDependencies(owner, repo.name, identity)
    : null
  const workspace = await fetchWorkspaceDependencies(owner, repo.name, files, identity)
  const dependencies = mergeTechnologies(rootDependencies, workspace.dependencies)
  const primary = repo.language && normalizeTechnology(repo.language)
  return {
    repo: {
      ...repo,
      technologies: mergeTechnologies(
        existing.get(repo.id),
        dependencies.length ? technologiesFromPackageDependencies(dependencies) : null,
        files && technologiesFromManifestFiles(files),
        languages?.filter(language => normalizeTechnology(language) !== primary),
      )
    } as IndexedRepo,
    packageJson: rootDependencies !== null || workspace.found,
  }
}

async function addManifestTechnologies(repos: GithubRepo[], existing: Map<number, string[]>, userId: string, accessToken: string) {
  const indexed: IndexedRepo[] = []
  let packageJsonCount = 0
  let enrichmentFailures = 0
  let enrichmentComplete = true
  const deadline = Date.now() + ENRICHMENT_BUDGET_MS
  for (let offset = 0; offset < repos.length; offset += MANIFEST_BATCH_SIZE) {
    // Past the budget, remaining repositories sync without fresh manifest or
    // language evidence rather than stalling or aborting the import.
    if (Date.now() > deadline) {
      enrichmentComplete = false
      indexed.push(...repos.slice(offset).map(repo => ({ ...repo, technologies: existing.get(repo.id) || [] })))
      break
    }
    const batch = await Promise.all(repos.slice(offset, offset + MANIFEST_BATCH_SIZE).map(async repo => {
      try {
        return await enrichRepository(repo, existing, userId, accessToken)
      } catch {
        // One malformed or inaccessible manifest must not abort the import;
        // the repository still syncs with its previously known technologies.
        return { repo: { ...repo, technologies: existing.get(repo.id) || [] } as IndexedRepo, packageJson: false, failed: true }
      }
    }))
    for (const result of batch) {
      if (result.packageJson) packageJsonCount++
      if ('failed' in result) enrichmentFailures++
      indexed.push(result.repo)
    }
  }
  return { repos: indexed, packageJsonCount, enrichmentFailures, enrichmentComplete }
}

export async function POST(request: Request) {
  let syncedCount = 0
  let packageJsonCount = 0
  try {
    const context = await authenticateUser()
    const { supabase, userId } = context
    let connectPrivate = false
    if (request.body) {
      const body = await readJsonBody(request, 1024, { allowEmpty: true })
      if (body !== undefined) connectPrivate = objectBody(body).connectPrivate === true
    }
    await enforceRateLimit(context, 'sync')

    // Attempt to get the provider token (GitHub PAT) from the session or a secure store
    // Note: If provider_token is not available, we may need the user to supply a PAT in their profile.
    const providerToken = await getProviderToken(context)

    if (!providerToken) {
      return NextResponse.json({
        error: 'No GitHub provider token found. Please re-authenticate or provide a Personal Access Token.'
      }, { status: 400 })
    }

    const identity = { userId, accessToken: providerToken }
    // Fetch repos from GitHub alongside a scope probe. The probe is advisory:
    // a null result leaves the recorded private-access capability unchanged.
    const [repos, scopes] = await Promise.all([fetchGithubRepos(identity), fetchGithubTokenScopes(identity)])

    // Sync to Supabase projects table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, github_private_scope')
      .eq('id', userId)
      .single()

    if (profileError) throw profileError
    if (!profile || profile.id !== userId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // The flag records the owner's choice, not the token's capability: it is
    // enabled only through the explicit connect flow, so disconnecting stays
    // disconnected even while the GitHub grant still carries the repo scope.
    const includePrivate = profile.github_private_scope === true
      || (connectPrivate && scopes !== null && scopes.includes('repo'))
    const visibleRepos = includePrivate ? repos : repos.filter(repo => !repo.is_private)

    const { data: existingProjects, error: existingError } = await supabase
      .from('projects')
      .select('github_repo_id, technologies, is_private')
      .eq('user_id', userId)
    if (existingError) throw existingError
    const existingTechnologies = new Map(((existingProjects || []) as ExistingProject[]).map(project => [
      Number(project.github_repo_id), project.technologies || []
    ]))
    const indexed = await addManifestTechnologies(visibleRepos, existingTechnologies, userId, providerToken)
    packageJsonCount = indexed.packageJsonCount

    for (let offset = 0; offset < indexed.repos.length; offset += 100) {
      const batch = indexed.repos.slice(offset, offset + 100)
      // Upsert project
      const { error } = await supabase.from('projects').upsert(batch.map(repo => ({
        user_id: profile.id,
        github_repo_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        language: repo.language,
        homepage: repo.homepage,
        stargazers_count: repo.stargazers_count,
        pushed_at: repo.pushed_at,
        github_created_at: repo.github_created_at,
        is_private: repo.is_private,
        github_fork: repo.github_fork,
        github_owner_login: repo.github_owner_login,
        github_owner_type: repo.github_owner_type,
        technologies: repo.technologies,
        github_deleted_at: null,
        updated_at: new Date().toISOString(),
      })), {
        onConflict: 'user_id,github_repo_id'
      })

      if (error) throw error
      syncedCount += batch.length
    }

    const fetchedIds = new Set(indexed.repos.map(repo => repo.id))
    const deletedIds = ((existingProjects || []) as ExistingProject[])
      .filter(project => (includePrivate || project.is_private === false) && !fetchedIds.has(Number(project.github_repo_id)))
      .map(project => Number(project.github_repo_id))
    for (let offset = 0; offset < deletedIds.length; offset += 100) {
      const batch = deletedIds.slice(offset, offset + 100)
      const tombstonedAt = new Date().toISOString()
      const { error } = await supabase.from('projects')
        .update({ github_deleted_at: tombstonedAt, updated_at: tombstonedAt })
        .eq('user_id', userId)
        .in('github_repo_id', batch)
      if (error) throw error
    }

    // Completed-catalog bookkeeping lives on the profile so webhook writes and
    // partial batches cannot masquerade as a full sync. A failure here must
    // not misreport the confirmed project writes above.
    const profileUpdate: Record<string, unknown> = {
      last_catalog_sync_at: new Date().toISOString(),
      github_private_scope: includePrivate,
    }
    const { error: syncMarkError } = await supabase.from('profiles').update(profileUpdate).eq('id', userId)
    if (syncMarkError) console.warn('Unable to record completed catalog sync')

    return NextResponse.json({
      message: 'Sync complete',
      syncedCount,
      packageJsonCount,
      enrichmentFailures: indexed.enrichmentFailures,
      enrichmentComplete: indexed.enrichmentComplete,
    })

  } catch (error) {
    const response = apiErrorResponse(error)
    return NextResponse.json({ ...await response.json(), syncedCount, packageJsonCount }, {
      status: response.status, headers: response.headers,
    })
  }
}
