import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for error returned by provider
        const params = new URLSearchParams(window.location.search)
        const errorParam = params.get('error')
        if (errorParam) {
          setError(params.get('error_description') || errorParam)
          return
        }

        // PKCE flow: exchange the code from query params
        const code = params.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message)
            return
          }
          navigate('/', { replace: true })
          return
        }

        // Implicit flow: tokens are in the URL hash fragment.
        // The Supabase client auto-detects these on init, so just
        // wait briefly for onAuthStateChange to fire in AuthProvider.
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          navigate('/', { replace: true })
          return
        }

        // If no code/hash/session, something went wrong
        setError('No authentication response received. Please try again.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    }

    handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 max-w-md">
          <p className="text-sm font-medium text-red-800">Authentication failed</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="text-sm text-violet-600 underline hover:text-violet-800"
        >
          Back to login
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  )
}
