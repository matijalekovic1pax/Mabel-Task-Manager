import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { Loader2 } from 'lucide-react'

export function LoginPage() {
  const { user, profile, loading, authState, signInWithGoogle } = useAuth()
  const [searchParams] = useSearchParams()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSessionExpired = searchParams.get('reason') === 'session_expired'

  if (loading || (user && !profile && authState !== 'access_denied')) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/30" />
      </div>
    )
  }

  if (user && profile) return <Navigate to="/" replace />
  if (authState === 'access_denied') return <Navigate to="/access-denied" replace />

  const handleSignIn = async () => {
    setError(null)
    setSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel — dark brand ───────────────────────── */}
      <div
        className="sidebar-grain relative hidden lg:flex lg:w-[45%] flex-col justify-between p-12 xl:p-16"
        style={{ background: 'var(--sidebar)' }}
      >
        {/* Wordmark */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-sm font-display text-lg font-medium"
            style={{ background: 'var(--sidebar-primary)', color: 'var(--sidebar-primary-foreground)' }}
          >
            M
          </div>
          <span
            className="font-display text-xl tracking-wide"
            style={{ color: 'var(--sidebar-primary)' }}
          >
            Mabel
          </span>
        </div>

        {/* Hero text */}
        <div className="space-y-6">
          <h1
            className="font-display text-5xl xl:text-6xl font-light leading-[1.08] tracking-tight"
            style={{ color: 'var(--sidebar-primary)' }}
          >
            Work flows
            <br />
            <em>better</em>
            <br />
            together.
          </h1>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--sidebar-foreground)', opacity: 0.65 }}>
            Company-wide task management. Assign work, track progress,
            and keep every project moving — from approvals to daily team tasks.
          </p>
        </div>

        {/* Footer */}
        <p className="text-xs" style={{ color: 'var(--sidebar-foreground)', opacity: 0.35 }}>
          © {new Date().getFullYear()} Mabel · Internal tool
        </p>
      </div>

      {/* ── Right panel — cream sign-in ───────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-12">
        {/* Mobile brand */}
        <div className="mb-12 flex items-center gap-3 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-foreground font-display text-base font-medium text-background">
            M
          </div>
          <span className="font-display text-lg tracking-wide text-foreground">Mabel</span>
        </div>

        <div className="w-full max-w-sm space-y-8 animate-page-in">
          <div className="space-y-2">
            <h2 className="font-display text-3xl font-light tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your company Google account to continue.
            </p>
          </div>

          <div className="space-y-3">
            {isSessionExpired && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Your session expired. Please sign in again.
              </div>
            )}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="group relative flex w-full items-center justify-center gap-3 rounded-md border border-border bg-card px-5 py-3.5 text-sm font-medium text-foreground shadow-sm transition-all duration-200 hover:bg-accent hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingIn ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {signingIn ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>

            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-5 py-3.5 text-sm font-medium text-background transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            >
              {signingIn
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : null
              }
              Sign in with Google
            </button>
          </div>

          <p className="text-xs text-muted-foreground/70 text-center">
            Access is restricted to authorised company accounts.
          </p>
        </div>
      </div>
    </div>
  )
}
