import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Demo mode — when no real Supabase URL is configured, auth is faked so
// the frontend can be verified independently.
// ---------------------------------------------------------------------------

const isDemo = !import.meta.env.VITE_SUPABASE_URL

const DEMO_USER: User = {
  id: 'demo-user-id',
  email: 'mabel@company.com',
  app_metadata: {},
  user_metadata: { full_name: 'Mabel' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as User

const DEMO_PROFILE: Profile = {
  id: 'demo-user-id',
  email: 'mabel@company.com',
  full_name: 'Mabel',
  role: 'ceo',
  avatar_url: null,
  department: 'Architecture',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

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

  // Fetch the profile row for the given user id
  const fetchProfile = useCallback(async (userId: string) => {
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

    setProfile(data)
  }, [])

  // Bootstrap: read the existing session on mount
  useEffect(() => {
    if (isDemo) {
      // Demo mode — skip real auth, just mark as not loading
      setLoading(false)
      return
    }

    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user.id)
        }
      } catch (err) {
        console.error('Error initializing auth:', err)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    // Listen for subsequent auth changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  // Sign in
  const signInWithGoogle = useCallback(async () => {
    if (isDemo) {
      setUser(DEMO_USER)
      setProfile(DEMO_PROFILE)
      return
    }

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
    if (isDemo) {
      setUser(null)
      setProfile(null)
      return
    }

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
