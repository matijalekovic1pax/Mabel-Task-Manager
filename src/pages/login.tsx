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
        <Loader2 className="h-5 w-5 animate-spin text-foreground/30" />
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
      {/* ── Left panel ────────────────────────────────────── */}
      <div
        className="sidebar-grain relative hidden lg:flex lg:w-[44%] flex-col justify-between p-12 xl:p-14"
        style={{ background: 'var(--sidebar)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg font-brand text-base"
            style={{ background: 'var(--sidebar-primary)', color: 'var(--sidebar-primary-foreground)' }}
          >
            M
          </div>
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--sidebar-primary)' }}>
            Mabel
          </span>
        </div>

        {/* Hero content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <h1
              className="text-4xl xl:text-5xl font-bold leading-[1.12] tracking-tight"
              style={{ color: 'var(--sidebar-primary)' }}
            >
              One place for<br />all your team's<br />work.
            </h1>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--sidebar-foreground)', opacity: 0.6 }}>
              Assign tasks, track approvals, and keep every project moving — from CEO sign-offs to daily team work.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-3">
            {[
              'CEO approval queue for formal requests',
              'Assign tasks to any team member',
              'Real-time updates and notifications',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--sidebar-foreground)', opacity: 0.65 }}>
                <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--sidebar-primary)' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-xs" style={{ color: 'var(--sidebar-foreground)', opacity: 0.3 }}>
          © {new Date().getFullYear()} Mabel · Internal tool
        </p>
      </div>

      {/* ── Right panel ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-brand text-base text-background">
            M
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Mabel</span>
        </div>

        <div className="w-full max-w-sm animate-page-in">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Sign in to Mabel
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Use your company Google account to continue.
            </p>
          </div>

          <div className="space-y-3">
            {isSessionExpired && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Your session expired. Please sign in again.
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="group flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-sm transition-all duration-150 hover:bg-accent hover:border-foreground/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingIn ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {signingIn ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground/60">
            Access is restricted to authorised company accounts.
          </p>
        </div>
      </div>
    </div>
  )
}
