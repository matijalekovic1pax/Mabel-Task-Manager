import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute({ children, requireRole }: { children: React.ReactNode; requireRole?: 'ceo' | 'team_member' }) {
  const { user, profile, loading, authState } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (authState === 'session_expired' || authState === 'unauthenticated' || !user) {
    return <Navigate to="/login?reason=session_expired" replace />
  }

  if (authState === 'access_denied') {
    return <Navigate to="/access-denied" replace />
  }

  if (!profile) {
    return <Navigate to="/access-denied" replace />
  }

  if (!profile.is_active) {
    return <Navigate to="/access-denied?reason=inactive" replace />
  }

  // super_admin bypasses all role restrictions
  if (profile.role === 'super_admin') {
    return <>{children}</>
  }

  if (requireRole && profile.role !== requireRole) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
