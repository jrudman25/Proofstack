import { expect, it } from 'vitest'
import { clientErrorMessage } from './client-error-message'

const fallback = 'Something failed.'

it('shows short 4xx API messages', () => {
  expect(clientErrorMessage({ status: 400 }, { error: 'Sync first' }, fallback)).toBe('Sync first')
  expect(clientErrorMessage({ status: 429 }, { error: 'Too many requests' }, fallback)).toBe('Too many requests')
})

it('falls back for server errors, missing status, malformed bodies, and oversized messages', () => {
  expect(clientErrorMessage({ status: 503 }, { error: 'stack trace' }, fallback)).toBe(fallback)
  expect(clientErrorMessage({}, { error: 'no status' }, fallback)).toBe(fallback)
  expect(clientErrorMessage({ status: 400 }, 'text', fallback)).toBe(fallback)
  expect(clientErrorMessage({ status: 400 }, { error: '   ' }, fallback)).toBe(fallback)
  expect(clientErrorMessage({ status: 400 }, { error: 'x'.repeat(201) }, fallback)).toBe(fallback)
})
