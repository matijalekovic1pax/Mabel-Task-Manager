import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'
import {
  isProfileMissingError,
  isSessionExpiredError,
} from '@/lib/supabase/errors'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

type AuthState =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'access_denied'
  | 'session_expired'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  authState: AuthState
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authState, setAuthState] = useState<AuthState>('loading')
  const initialized = useRef(false)
  const sessionExpiredRef = useRef(false)
  const loading = authState === 'loading'

  // Fetch the profile row for the given user id.
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        if (isSessionExpiredError(error)) {
          return { profile: null, state: 'session_expired' as const }
        }

        if (isProfileMissingError(error)) {
          return { profile: null, state: 'access_denied' as const }
        }

        console.error('Failed to fetch profile:', error.message)
        return { profile: null, state: 'access_denied' as const }
      }

      if (!data) {
        return { profile: null, state: 'access_denied' as const }
      }

      return { profile: data, state: 'authenticated' as const }
    } catch (err) {
      console.error('Profile fetch error:', err)
      if (isSessionExpiredError(err)) {
        return { profile: null, state: 'session_expired' as const }
      }
      return { profile: null, state: 'access_denied' as const }
    }
  }, [])

  // Use onAuthStateChange as the single source of truth (Supabase recommended).
  // It fires INITIAL_SESSION on mount, then SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED.
  //
  // IMPORTANT: This callback must NOT make Supabase API calls directly.
  // supabase-js v2.39+ holds an internal Navigator Lock during this callback.
  // Any Supabase query (e.g. fetching a profile) needs that same lock to read
  // the session token, which causes a deadlock that permanently blocks ALL
  // subsequent Supabase requests.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      initialized.current = true

      if (!session?.user) {
        setUser(null)
        setProfile(null)
        setAuthState(
          sessionExpiredRef.current ? 'session_expired' : 'unauthenticated',
        )
        return
      }

      sessionExpiredRef.current = false
      setUser(session.user)

      // On TOKEN_REFRESHED the profile hasn't changed — skip the fetch.
      if (event === 'TOKEN_REFRESHED') {
        return
      }

      // For INITIAL_SESSION / SIGNED_IN, fetch the profile in a setTimeout
      // so it runs AFTER the internal auth lock is released.
      setTimeout(() => {
        fetchProfile(session.user.id).then((result) => {
          if (result.state === 'session_expired') {
            sessionExpiredRef.current = true
            supabase.auth.signOut({ scope: 'local' }).catch(() => {})
            setUser(null)
            setProfile(null)
            setAuthState('session_expired')
          } else {
            setProfile(result.profile)
            setAuthState(result.state)
          }
        })
      }, 0)
    })

    // Safety timeout - if onAuthStateChange never fires (broken client, network
    // issue, corrupt localStorage), stop loading after 5 seconds so the user
    // isn't stuck on a blank screen forever.
    const timeout = setTimeout(() => {
      if (!initialized.current) {
        console.warn('Auth initialization timed out - clearing session')
        supabase.auth.signOut().catch(() => {})
        setUser(null)
        setProfile(null)
        setAuthState('unauthenticated')
        initialized.current = true
      }
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [fetchProfile])

  // Re-fetch the profile (e.g. after the user edits their name/department)
  const refreshProfile = useCallback(async () => {
    if (!user) return
    const result = await fetchProfile(user.id)
    if (result.profile) {
      setProfile(result.profile)
    }
  }, [user, fetchProfile])

  // Sign in - always redirects to Google OAuth
  const signInWithGoogle = useCallback(async () => {
    sessionExpiredRef.current = false

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('Google sign-in error:', error.message)
      throw error
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
    sessionExpiredRef.current = false

    try {
      // Local scope avoids logout failures caused by upstream token revoke issues.
      const { error } = await supabase.auth.signOut({ scope: 'local' })

      if (error) {
        console.error('Sign-out error:', error.message)
        throw error
      }
    } finally {
      setUser(null)
      setProfile(null)
      setAuthState('unauthenticated')
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, profile, authState, loading, signInWithGoogle, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
