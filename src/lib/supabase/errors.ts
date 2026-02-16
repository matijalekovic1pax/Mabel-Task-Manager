export type SessionErrorKind = 'session_expired' | 'unauthorized' | null

type ErrorWithCode = {
  code?: string
  status?: number
  message?: string
  details?: string
  hint?: string
}

function normalizeError(error: unknown): ErrorWithCode {
  if (!error || typeof error !== 'object') {
    return {}
  }

  return error as ErrorWithCode
}

function collectErrorText(error: ErrorWithCode): string {
  return [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function getSessionErrorKind(error: unknown): SessionErrorKind {
  const parsed = normalizeError(error)
  const code = parsed.code?.toLowerCase() ?? ''
  const status = parsed.status
  const text = collectErrorText(parsed)

  if (status === 401) return 'unauthorized'

  if (code === 'pgrst301' || code === 'jwt_expired') {
    return 'session_expired'
  }

  if (
    text.includes('jwt expired')
    || text.includes('token has expired')
    || text.includes('invalid jwt')
    || text.includes('invalid token')
    || text.includes('refresh token not found')
    || text.includes('auth session missing')
    || text.includes('session expired')
  ) {
    return 'session_expired'
  }

  if (text.includes('unauthorized') || text.includes('not authenticated')) {
    return 'unauthorized'
  }

  return null
}

export function isSessionExpiredError(error: unknown): boolean {
  const kind = getSessionErrorKind(error)
  return kind === 'session_expired' || kind === 'unauthorized'
}

export function isProfileMissingError(error: unknown): boolean {
  const parsed = normalizeError(error)
  const code = parsed.code?.toLowerCase() ?? ''
  const text = collectErrorText(parsed)

  return code === 'pgrst116' || text.includes('0 rows') || text.includes('no rows')
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  const parsed = normalizeError(error)
  if (parsed.message) {
    return parsed.message
  }

  return fallback
}
