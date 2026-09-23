import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { readBodyBytes } from '@/lib/read-body'
import { createClient } from '@supabase/supabase-js'
import { getServerSupabaseEnv, getSupabaseServiceKey, getWebhookSecret } from '@/lib/env-server'
import { createRedis, redisKey } from '@/lib/redis'

export const runtime = 'nodejs'

// Webhook secret for verification (if configured in GitHub)
function verifySignature(payload: Uint8Array, signature: string | null, secret: string) {
  if (!secret) return false // Skip if not configured
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false

  const digest = crypto.createHmac('sha256', secret).update(payload).digest()
  const supplied = Buffer.from(signature.slice(7), 'hex')
  return supplied.length === digest.length && crypto.timingSafeEqual(supplied, digest)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOwner(value: unknown): value is { login: string; type: string } {
  return isObject(value) && typeof value.login === 'string' && /^[\w-]+$/.test(value.login)
}

function isRepository(value: unknown): value is {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  pushed_at: string | null
  private: boolean
  fork: boolean
  owner: { login: string; type: string }
} {
  if (!isObject(value)) return false
  return Number.isSafeInteger(value.id) && (value.id as number) > 0
    && typeof value.name === 'string' && /^[\w.-]+$/.test(value.name) && value.name !== '.' && value.name !== '..'
    && typeof value.full_name === 'string' && /^[\w-]+\/[\w.-]+$/.test(value.full_name)
    && value.full_name.split('/')[1] === value.name
    && (value.description === null || typeof value.description === 'string')
    && value.html_url === `https://github.com/${value.full_name}`
    && (value.language === null || typeof value.language === 'string')
    && Number.isSafeInteger(value.stargazers_count) && (value.stargazers_count as number) >= 0
    && (value.pushed_at === null || (typeof value.pushed_at === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.pushed_at)
      && Number.isFinite(Date.parse(value.pushed_at))))
    && typeof value.private === 'boolean'
    && typeof value.fork === 'boolean'
    && isOwner(value.owner)
}

export async function POST(request: Request) {
  try {
    const secret = getWebhookSecret()

    const signature = request.headers.get('x-hub-signature-256')
    if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    let rawBody: Uint8Array
    try {
      rawBody = await readBodyBytes(request, 2 * 1024 * 1024)
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    const event = request.headers.get('x-github-event')
    if (contentType !== 'application/json' || !event || !['push', 'repository', 'ping'].includes(event)) {
      return NextResponse.json({ error: 'Unsupported webhook' }, { status: 400 })
    }

    let payload: unknown
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody))
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    if (!isObject(payload)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    if (event === 'ping') return NextResponse.json({ received: true })
    if (event === 'repository' && typeof payload.action !== 'string') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    if (!isRepository(payload.repository)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const repo = payload.repository

    const deliveryId = request.headers.get('x-github-delivery')
    if (!deliveryId || !/^[A-Za-z0-9-]{1,100}$/.test(deliveryId)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // GitHub redelivers webhooks; claim the delivery id so a retry never
    // repeats the database write. Failing closed skips the write entirely.
    let redis: ReturnType<typeof createRedis> | null = null
    let deliveryKey = ''
    try {
      deliveryKey = redisKey({ userId: 'public' }, 'github-webhook-delivery', deliveryId)
      redis = createRedis()
      const claimed = await redis.set(deliveryKey, 1, { nx: true, ex: 259200 })
      if (claimed === null) return NextResponse.json({ received: true, duplicate: true })
    } catch {
      return NextResponse.json({ error: 'Webhook processing unavailable' }, { status: 503 })
    }

    try {
      // Using service role key because webhooks are not authenticated as users
      const { url } = getServerSupabaseEnv()
      const serviceKey = getSupabaseServiceKey()
      const supabase = createClient(
        url,
        serviceKey, // Use service role for webhooks
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      )

      if (event === 'repository' && payload.action === 'deleted') {
        const now = new Date().toISOString()
        const { error } = await supabase.from('projects')
          .update({ github_deleted_at: now, updated_at: now })
          .eq('github_repo_id', repo.id)
        if (error) throw error
        return NextResponse.json({ received: true })
      }

      // We need to find if this repo exists in our DB, and who it belongs to
      // Update existing project
      // Visibility and ownership fields matter as much as the metadata: a
      // repository made private on GitHub must drop off public profiles and AI
      // payloads immediately (the consent trigger removes its embeddings), not
      // wait for the owner's next manual sync. GitHub reporting the repository
      // again also clears any tombstone. A stale push payload must never
      // downgrade visibility, so is_private flips to false only on an explicit
      // publicized event.
      const { error } = await supabase.from('projects').update({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        pushed_at: repo.pushed_at,
        ...(repo.private ? { is_private: true }
          : event === 'repository' && payload.action === 'publicized' ? { is_private: false }
          : {}),
        github_fork: repo.fork,
        github_owner_login: repo.owner.login,
        github_owner_type: repo.owner.type === 'User' || repo.owner.type === 'Organization' ? repo.owner.type : null,
        github_deleted_at: null,
        updated_at: new Date().toISOString()
      }).eq('github_repo_id', repo.id)
      if (error) throw error
    } catch (error) {
      // Release the delivery claim so GitHub's redelivery can retry the write.
      try { await redis?.del(deliveryKey) } catch { /* best effort */ }
      throw error
    }

    // TODO: We could trigger a new Gemini summary generation if pushed_at changed significantly
    return NextResponse.json({ received: true })
  } catch {
    console.error('Webhook processing failed')
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
