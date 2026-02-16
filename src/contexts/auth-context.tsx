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

const SUPER_ADMIN_EMAIL = import.meta.env.SUPER_ADMIN_EMAIL?.toLowerCase() ?? ''

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const loadingResolved = useRef(false)

  const markReady = useCallback(() => {
    if (!loadingResolved.current) {
      loadingResolved.current = true
      setLoading(false)
    }
  }, [])

  // Fetch the profile row for the given user id.
  // If the user's email matches SUPER_ADMIN_EMAIL, promote to super_admin.
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Failed to fetch profile:', error.message)
        setProfile(null)
        return
      }

      if (SUPER_ADMIN_EMAIL && data.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
        setProfile({ ...data, role: 'super_admin' })
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.error('Profile fetch error:', err)
      setProfile(null)
    }
  }, [])

  // Use onAuthStateChange as the single source of truth (Supabase recommended).
  // It fires INITIAL_SESSION on mount, then SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
      }
      markReady()
    })

    // Safety timeout — if onAuthStateChange never fires (broken client, network
    // issue, corrupt localStorage), stop loading after 5 seconds so the user
    // isn't stuck on a blank screen forever.
    const timeout = setTimeout(() => {
      if (!loadingResolved.current) {
        console.warn('Auth initialization timed out — clearing session')
        supabase.auth.signOut().catch(() => {})
        setUser(null)
        setProfile(null)
        markReady()
      }
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [fetchProfile, markReady])

  // Sign in — always redirects to Google OAuth
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

  // Sign out
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Sign-out error:', error.message)
      throw error
    }

    setUser(null)
    setProfile(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signInWithGoogle, signOut }}
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
