// API routes return sanitized `{ error }` messages through `apiErrorResponse`.
// Client-actionable 4xx messages (for example "Sync GitHub projects before
// generating a briefing" or a rate limit) are shown; everything else falls
// back to a generic message so infrastructure errors never reach the UI.
export function clientErrorMessage(response: { status?: number }, body: unknown, fallback: string) {
  const status = response.status ?? 0
  const message = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
  if (status >= 400 && status < 500 && typeof message === 'string' && message.trim() && message.length <= 200) {
    return message
  }
  return fallback
}
