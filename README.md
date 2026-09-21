# Proofstack

Proofstack is a GitHub portfolio intelligence tool. It helps developers quickly understand, remember, and explain their project work, then helps external viewers understand that work through concise, evidence-backed portfolio briefings.

The initial product is a private workspace for episodic interview preparation and project rediscovery. The planned public experience adds owner-curated portfolio profiles and temporary, clearly labeled analysis of unclaimed public GitHub profiles.

## Product experience

Proofstack organizes the experience around three levels:

1. **Briefing:** Summarize what a developer has built, recurring technologies and domains, notable architectural decisions, challenges, growth, and projects worth deeper review.
2. **Browse:** Present searchable project briefs alongside the GitHub evidence and owner-authored context that support them.
3. **Ask:** Answer grounded portfolio-wide or project-specific questions with citations and clear provenance.

GitHub remains the source of truth for repository facts. Proofstack adds derived insights and owner-controlled context such as purpose, inspiration, role and contributions, architecture, key decisions, challenges, outcomes, lessons learned, lifecycle status, and interview talking points.

AI enriches the product rather than replacing conventional navigation. Search, filtering, metadata, and project briefs must remain useful without AI. Generated drafts require owner review, approved content is never silently overwritten, and output must distinguish GitHub facts, owner-authored statements, and AI-derived interpretations. Generic README summarization is not a product goal.

## Product boundaries

- The private workspace may contain all explicitly imported repositories so owners can search and rediscover their work. Owners choose which projects and supplementary fields appear on an official public profile.
- Private repository analysis requires explicit opt-in. Raw private evidence is never public; only manually reviewed, sanitized owner content may be published.
- Public profile chat is restricted to the owner's curated content boundary. Temporary analysis of an unclaimed profile uses public GitHub data and must not imply owner verification or endorsement.
- Initial evidence comes from GitHub metadata, READMEs, root manifests, and language data. Full source-code indexing may be considered later but is not part of the initial scope.
- Proofstack does not replace GitHub Issues or project boards. Task tracking, milestone management, generic AI README summaries, social networking, recruiter CRM features, and real-time repository monitoring are outside the product direction.

## Current implementation

The application currently provides the private foundation of this direction:

- GitHub OAuth through Supabase Auth with tenant-isolated projects and embeddings.
- Manual repository sync with pagination and cached GitHub responses. Sync preserves each repository's GitHub visibility and creation date, and reads each repository's root file listing, language data, and `package.json` in bounded batches inside a fixed enrichment budget, detecting a curated set of frameworks and tools and merging them with existing technology metadata. A failed or slow enrichment marks the affected repositories and still completes the import; the dashboard reports partial results. Signed webhooks update metadata for repositories already present in the database; they do not import new repositories.
- `gemini-embedding-2` embeddings explicitly requested at 768 dimensions and stored in pgvector. Invalid, nonfinite, zero, or incorrectly sized vectors are rejected rather than silently truncated. Retrieval uses cosine distance.
- One current README embedding per project, keyed by `(project_id, source)` with source `readme`. Embedding uses the first 8,000 README characters and is triggered explicitly per project through `POST /api/projects/[id]/index`, which records the `pushed_at` the embedding was built from so stale evidence is detectable.
- Hybrid chat supplies up to 500 authenticated-user project records as structured metadata with GitHub fields, owner-authored context, and evidence status clearly separated, plus a normalized technology-to-project index, and retrieves up to five matching README documents for semantic detail. The dashboard chat covers the whole portfolio; the chat on a project page is scoped to that project. Private repositories are excluded from every AI payload unless the owner enabled AI processing for that project. Structured metadata remains available if vector retrieval is unavailable. Chat does not browse source files or execute code.
- A briefing-first dashboard: the interview briefing is the primary action, followed by a searchable and sortable project list showing GitHub descriptions, owner-authored purpose notes and lifecycle status, locally bundled Devicons matched by normalized technology name, GitHub Linguist language colors, the last completed catalog sync, and keyboard-accessible controls. Connected catalogs can be filtered by All, Public, or Private without deleting synced projects. Sync is a secondary action beside the project list and refreshes server data without a full page reload.
- Per-project AI consent for private repositories. Private repositories sync into the private workspace but are withheld from briefings, chat, and indexing until the owner enables AI processing on the project page. Database triggers serialize embedding writes with consent changes: revocation deletes stored embeddings in the same transaction, while an in-flight write either finishes first and is deleted or waits and is rejected.
- Legacy task and milestone panels appear on a project page only when that project already has records, behind a collapsed disclosure. Projects without records are not offered the feature.
- Owner-editable project briefs with lifecycle and future portfolio-visibility settings; guided context for purpose, inspiration, contributions, architecture, challenges, impact, lessons, and interview talking points; and an explicit owner-review state. A brief with content opens as readable sections with an explicit Edit mode; empty briefs start with a few guided fields. Brief writes use an authenticated, ownership-checked API with tenant-isolated RLS and an optimistic `updated_at` precondition that rejects stale writes.
- On-demand portfolio interview briefings covering recurring themes, project spotlights, growth, evidence gaps, and practice questions. Briefings persist per user with the generated time and the repository snapshot they were built from, so the dashboard reloads the latest briefing and reports how many repositories changed since. Output requires schema-validated model output, rejects fabricated project references, and attaches citations that distinguish GitHub metadata from owner notes and link into the internal project workspace.
- A privacy disclosure page (`/privacy`), an account page (`/account`), and authenticated account deletion through `DELETE /api/account`, which removes the Auth user and cascades to all tenant data including the stored GitHub credential.
- Owner-curated public profiles at `/u/[slug]`. The owner chooses a stable profile URL, selects which projects appear (brief visibility), and checks which brief fields are published per project; interview talking points are never publishable. The public page leads with a published snapshot of the portfolio briefing, so regenerating the private briefing never silently changes public content. Repository relationship (fork, organization-owned) is displayed separately from the owner's stated role and contributions. Private repositories are excluded unconditionally. All public data exits through one server-only retrieval boundary (`src/lib/public-profile.ts`) that returns only approved fields.

AI project-brief drafts, public profile chat, and anonymous profile analysis remain planned work. The codebase still contains legacy task, milestone, and code-map structures and the `projects.summary` column, which are not part of the future product direction and require deliberate deprecation rather than destructive removal.

## Requirements

- Node.js 24 LTS and npm, with the committed lockfile.
- Supabase with GitHub OAuth enabled and the `vector` extension available.
- A Gemini API key with access to the model IDs above.
- An Upstash Redis REST database for cache isolation, rate limits, and processing leases.
- A GitHub OAuth app configured in Supabase. Sign-in requests `public_repo`, `read:user`, and `user:email`; the broader `repo` scope is requested only when the owner chooses to include private repositories. Webhooks are configured manually, so no webhook scope is requested. GitHub provider tokens are captured during the callback and encrypted at rest for later syncs.

## Installation

```bash
npm ci
cp .env.local.example .env.local
```

Set every variable in `.env.local.example` before running the server:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe Supabase anonymous/publishable client key |
| `NEXT_PUBLIC_APP_URL` | Canonical application origin; HTTPS in production, without credentials, path, query, or fragment |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged key used by the signed webhook and the public-profile retrieval boundary |
| `GITHUB_WEBHOOK_SECRET` | Shared webhook HMAC secret; mandatory |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Server-only canonical base64 encoding of 32 random bytes used for AES-256-GCM |
| `CRON_SECRET` | Server-only random bearer secret of at least 32 characters for maintenance requests |
| `GEMINI_API_KEY` | Server-only Gemini credential |
| `UPSTASH_REDIS_REST_URL` | HTTPS Redis REST origin |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only Redis credential |

Never prefix privileged keys with `NEXT_PUBLIC_`. Public variables are bundled at build time. Use distinct service resources for production and development. Generate `GITHUB_TOKEN_ENCRYPTION_KEY` with a cryptographically secure 32-byte generator, encode it as canonical base64, and keep it stable for the lifetime of stored credentials; rotating it requires reauthentication or a controlled re-encryption process. Redis keys include the application environment (`VERCEL_ENV`, falling back to `NODE_ENV`), the user identity, and, for GitHub caches, a SHA-256 digest of the complete authorization context. Raw access tokens and token fragments are never used as keys.

### Database setup and upgrades

For a clean database, apply `supabase/setup.sql`, then `supabase/functions.sql`, using a reviewed database deployment process. These define the RLS policies required by the application.

For an existing installation, review and apply the migrations in `supabase/migrations/` in timestamp order before deploying the corresponding application changes. This includes `20260916000000_serialize_ai_consent_embeddings.sql`, which must be applied before deploying the trigger-backed consent route. Back up the database and test restoration first. Test migrations against a local or staging copy, including a second hardening-migration run to confirm idempotency. Pause writes during the hardening upgrade: it takes exclusive table locks and builds an HNSW index non-concurrently.

The hardening migration widens GitHub repository IDs to bigint, replaces the inner-product vector index with a cosine index, adds lookup indexes, hardens function search paths, and introduces embedding-source uniqueness. The credentials migration adds a service-role-only table containing authenticated ciphertext; browser roles have no table grants or RLS policies, and deleting the Auth user cascades to the credential. The project-brief migration adds a non-destructive owner-context table with project-derived RLS policies; it leaves existing project, task, milestone, summary, and embedding data unchanged. The `(project_id, source)` unique index also covers lookups by `project_id`. Existing embeddings are preserved: the latest recognized legacy README becomes current, previous versions become historical sources excluded from retrieval, and other legacy rows receive unique legacy sources. Ambiguous mappings abort the transaction for operator review rather than deleting data.

Restore from a verified backup if an upgrade cannot be completed safely. Do not run the clean-install schema over an existing database. Do not roll back the application to a duplicate-inserting processor while retaining the new schema without reviewing compatibility.

### GitHub webhook setup

Configure a repository webhook with:

- Payload URL: the application origin followed by `/api/webhooks/github`.
- Content type: `application/json`.
- Secret: the same nonempty `GITHUB_WEBHOOK_SECRET` configured on the server.
- Events: pushes and repository events. Signed GitHub `ping` deliveries are acknowledged.

The handler verifies HMAC SHA-256 over the original request bytes with a timing-safe comparison. Missing/invalid signatures return 401; malformed payloads and unsupported events return 400; configuration/database failures return sanitized 500 responses. All matching existing portfolio entries for a repository are updated, including entries belonging to different users. The service-role key is confined to server-side code. API routes are never redirected to the login page by the Next.js Proxy.

## Limits and failure behavior

- Repository sync uses pages of 100, with at most 50 page requests. A full final page produces an explicit error before database writes rather than silently truncating the list; up to 4,999 results can be confirmed complete within this bound.
- Validated repository metadata is upserted in batches of at most 100. A failed batch returns a non-success response with `syncedCount` for confirmed earlier batches. Transport failures can leave the final batch's commit status uncertain; retrying the upsert is safe.
- Webhook bodies are capped at 2 MiB, GitHub repository responses at 2 MiB per page, root `package.json` files at 256 KiB, and READMEs at 1 MiB, including cached README values. Oversized webhook deliveries return 400; oversized provider responses return sanitized 503 errors. GitHub requests time out after 15 seconds, with a 60-second repository traversal budget and a 45-second manifest/language enrichment budget; repositories past the budget still sync without fresh enrichment. Redis requests time out after 15 seconds; Gemini calls after 60 seconds, using explicit model fallback rather than SDK retries.
- Repository lists and root `package.json` dependency names are cached for one hour; READMEs are cached for 24 hours. Missing root manifests, language lists, root listings, and READMEs are cached for one hour. Webhook metadata updates do not invalidate these caches. Cache isolation separates both users and tokens, including anonymous README requests.
- Per-user atomic limits: chat 20 requests per 60 seconds, briefings 5 per 300 seconds, sync 5 per 300 seconds, README indexing 10 per 300 seconds, project briefs 20 per 60 seconds, account deletion 5 per 300 seconds. HTTP 429 includes `Retry-After`; unavailable Redis fails closed with 503.
- Request bodies are streamed with caps of 64 KiB for chat, 32 KiB for project briefs, and 1 KiB for sync, indexing, and project settings. Sync and indexing accept no body. Invalid JSON, oversized bodies, invalid UUIDs, and malformed chat input return 400. Chat accepts 1 to 40 user/assistant messages, at most 8,000 characters per message and 32,000 total, ending with a user message; the client additionally bounds sent history to the most recent 20 messages or 16,000 characters.
- API error bodies are sanitized server-side. The interface displays short 4xx messages (for example a rate limit or a missing-sync prerequisite) and shows a generic message for every other failure.
- Project-specific APIs check ownership in addition to RLS. Server authentication uses `getUser()` before any provider-token session lookup. The OAuth callback encrypts GitHub tokens with AES-256-GCM and user-bound authenticated data before service-role storage; refreshed sessions retrieve the ciphertext server-side. Production callback redirects use the configured application origin and ignore forwarded hosts; only safe local `next` paths are accepted.
- README indexing uses a 300-second user/project Redis lease, with owner-checked renewal and release. Concurrent requests return 409. The lease coordinates indexing requests; database row locks independently serialize every embedding write with AI consent changes. Re-indexing replaces the single current README embedding without duplicates.
- README and retrieved context are untrusted model inputs, separated from system instructions. Owner context, GitHub metadata, and retrieved documents are labeled by provenance in the model payload. This reduces prompt-injection risk but does not make generated output authoritative.

## Runtime reliability

Environment validation runs during server initialization and fails startup with variable names only, never secret values. Next sets `NODE_ENV` automatically. Aggregate runtime-secret validation is skipped during production builds; never set `NEXT_PHASE=phase-production-build` on a running deployment. Public values and the configured Supabase CSP origin are build-time settings, so rebuild when they change. OAuth callbacks use `NEXT_PUBLIC_APP_URL` in development as well as production.

`GET /api/health` returns uncached `{ "status": "ok" }` without authentication or provider calls. It is a liveness signal, not evidence that Supabase, GitHub, Gemini, or Redis is available.

Responses include `nosniff`, a strict-origin referrer policy, denied framing, and a Content Security Policy restricted to local assets, GitHub avatars, and the configured Supabase origin. Inline scripts/styles remain allowed for compatibility with Next.js; this is weaker than a nonce-based CSP. Production does not allow `unsafe-eval`.

## Development and verification

```bash
npm run dev
npm test
npm run test:watch
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

Tests cover request boundaries, signatures, authentication and redirects, hybrid chat context and retrieval fallback, cache isolation, pagination, rate limits, processing leases/idempotency, and Gemini fallback/embedding behavior. External providers are simulated; these tests do not prove live provider availability or deployed RLS behavior. Migration tests are static checks, not a PostgreSQL execution test.

Next.js and `eslint-config-next` are pinned to stable 16.3.4. The application uses the Next.js Proxy convention, native flat ESLint configuration, and the default Turbopack development and production builds. Audit findings must be reviewed before deployment; a stable framework pin is not a claim that every transitive dependency is vulnerability-free.

## License

MIT
