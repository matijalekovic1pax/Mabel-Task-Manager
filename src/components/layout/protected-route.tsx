import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { hasAdminAccess } from '@/lib/utils/roles'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute({ children, requireRole }: { children: React.ReactNode; requireRole?: 'ceo' | 'team_member' }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!profile) {
    return <Navigate to="/access-denied" replace />
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
