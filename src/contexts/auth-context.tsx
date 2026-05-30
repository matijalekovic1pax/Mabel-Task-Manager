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

const VIEW_AS_ROLE_KEY = '1pax_view_as_role'

type UserRole = Profile['role']

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
  /** The role the UI should render as. For super_admin this may be overridden by viewAsRole. */
  effectiveRole: UserRole | null
  /** The currently active view-as override (super_admin only). null = real role. */
  viewAsRole: UserRole | null
  setViewAsRole: (role: UserRole | null) => void
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
  const [viewAsRole, setViewAsRoleState] = useState<UserRole | null>(() => {
    const stored = localStorage.getItem(VIEW_AS_ROLE_KEY)
    return (stored as UserRole) ?? null
  })
  const initialized = useRef(false)
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
        setAuthState('unauthenticated')
        return
      }

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
            supabase.auth.signOut({ scope: 'local' }).catch(() => {})
            setUser(null)
            setProfile(null)
            setAuthState('session_expired')
          } else {
            // Use functional update to keep a stable object reference when the
            // profile data hasn't changed. This prevents downstream useCallback /
            // useEffect hooks (Realtime subscriptions, refresh callbacks) from
            // being recreated on every TOKEN_REFRESHED or double StrictMode mount.
            setProfile((prev) => {
              if (
                prev &&
                result.profile &&
                prev.id === result.profile.id &&
                prev.updated_at === result.profile.updated_at
              ) {
                return prev
              }
              return result.profile
            })
            setAuthState(result.state)
          }
        })
      }, 0)
    })

    // Safety timeout - if onAuthStateChange never fires (broken client, network
    // issue, corrupt sessionStorage), stop loading after 5 seconds so the user
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
      setProfile((prev) => {
        if (
          prev &&
          result.profile &&
          prev.id === result.profile.id &&
          prev.updated_at === result.profile.updated_at
        ) {
          return prev
        }
        return result.profile
      })
    }
  }, [user, fetchProfile])

  // Sign in - always redirects to Google OAuth
  const signInWithGoogle = useCallback(async () => {
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

  // Set the view-as role override (super_admin only). Persisted to localStorage.
  const setViewAsRole = useCallback((role: UserRole | null) => {
    setViewAsRoleState(role)
    if (role) {
      localStorage.setItem(VIEW_AS_ROLE_KEY, role)
    } else {
      localStorage.removeItem(VIEW_AS_ROLE_KEY)
    }
  }, [])

  // effectiveRole: the role the UI should use for rendering decisions.
  // super_admin can preview another role via viewAsRole; everyone else always sees their real role.
  const effectiveRole: UserRole | null = profile
    ? (profile.role === 'super_admin' && viewAsRole ? viewAsRole : profile.role)
    : null

  // Sign out
  const signOut = useCallback(async () => {
    localStorage.removeItem(VIEW_AS_ROLE_KEY)
    setViewAsRoleState(null)

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
      value={{ user, profile, authState, loading, effectiveRole, viewAsRole, setViewAsRole, signInWithGoogle, signOut, refreshProfile }}
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
