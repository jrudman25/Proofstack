import { NextResponse } from 'next/server'
import { authenticateUser, getProviderToken } from '@/lib/api-auth'
import { apiErrorResponse, objectBody, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { fetchGithubPackageDependencies, fetchGithubRepoLanguages, fetchGithubRepos, fetchGithubRootEntries, type GithubRepo } from '@/lib/github/api'
import { mergeTechnologies, normalizeTechnology, technologiesFromPackageDependencies } from '@/lib/package-technologies'
import { technologiesFromManifestFiles } from '@/lib/manifest-technologies'

const MANIFEST_BATCH_SIZE = 10

type ExistingProject = { github_repo_id: number; technologies: string[] | null }

async function addManifestTechnologies(repos: GithubRepo[], existing: Map<number, string[]>, userId: string, accessToken: string) {
  const indexed: (GithubRepo & { technologies: string[] })[] = []
  let packageJsonCount = 0
  for (let offset = 0; offset < repos.length; offset += MANIFEST_BATCH_SIZE) {
    const batch = await Promise.all(repos.slice(offset, offset + MANIFEST_BATCH_SIZE).map(async repo => {
      const identity = { userId, accessToken }
      const [owner] = repo.full_name.split('/')
      const [files, languages] = await Promise.all([
        fetchGithubRootEntries(owner, repo.name, identity),
        fetchGithubRepoLanguages(owner, repo.name, identity),
      ])
      // The root listing tells us whether package.json exists, so non-JS
      // repositories skip an extra request that would 404.
      const dependencies = files?.includes('package.json')
        ? await fetchGithubPackageDependencies(owner, repo.name, identity)
        : null
      if (dependencies !== null) packageJsonCount++
      const primary = repo.language && normalizeTechnology(repo.language)
      return {
        ...repo,
        technologies: mergeTechnologies(
          existing.get(repo.id),
          dependencies && technologiesFromPackageDependencies(dependencies),
          files && technologiesFromManifestFiles(files),
          languages?.filter(language => normalizeTechnology(language) !== primary),
        )
      }
    }))
    indexed.push(...batch)
  }
  return { repos: indexed, packageJsonCount }
}

export async function POST(request: Request) {
  let syncedCount = 0
  let packageJsonCount = 0
  try {
    const context = await authenticateUser()
    const { supabase, userId } = context
    if (request.body) {
      const body = await readJsonBody(request, 1024, { allowEmpty: true })
      if (body !== undefined) objectBody(body)
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

    // Fetch repos from GitHub
    const repos = await fetchGithubRepos({ userId, accessToken: providerToken })

    // Sync to Supabase projects table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (profileError) throw profileError
    if (!profile || profile.id !== userId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: existingProjects, error: existingError } = await supabase
      .from('projects')
      .select('github_repo_id, technologies')
      .eq('user_id', userId)
    if (existingError) throw existingError
    const existingTechnologies = new Map(((existingProjects || []) as ExistingProject[]).map(project => [
      Number(project.github_repo_id), project.technologies || []
    ]))
    const indexed = await addManifestTechnologies(repos, existingTechnologies, userId, providerToken)
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
        technologies: repo.technologies,
        updated_at: new Date().toISOString(),
      })), {
        onConflict: 'user_id,github_repo_id'
      })

      if (error) throw error
      syncedCount += batch.length
      
      // Note: Triggering AI processing (Gemini) can be done asynchronously via another background worker/route
      // or here if we want to wait, but it's better to queue it to avoid Vercel 10s timeouts.
    }

    return NextResponse.json({ message: 'Sync complete', syncedCount, packageJsonCount })

  } catch (error) {
    const response = apiErrorResponse(error)
    return NextResponse.json({ ...await response.json(), syncedCount, packageJsonCount }, {
      status: response.status, headers: response.headers,
    })
  }
}
