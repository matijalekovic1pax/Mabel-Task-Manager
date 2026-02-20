import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getTeamMembers, getAllowedEmails } from '@/lib/services/team'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AdminOverviewTab } from './admin-overview-tab'
import { AdminMembersTab } from './admin-members-tab'
import { AdminAccessTab } from './admin-access-tab'
import { Loader2 } from 'lucide-react'
import type { Profile, AllowedEmail } from '@/lib/types'
import { isSuperAdmin } from '@/lib/utils/roles'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'

export function AdminDashboardPanel() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  const [members, setMembers] = useState<Profile[]>([])
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardRef = useRef(createRequestGuard())
  const hasLoadedRef = useRef(false)

  const refresh = useCallback(async () => {
    const requestId = guardRef.current.next()

    if (hasLoadedRef.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    if (!profile) {
      if (!guardRef.current.isLatest(requestId)) return
      setLoading(false)
      setRefreshing(false)
      return
    }

    setError(null)

    try {
      const [m, ae] = await withTimeout(
        Promise.all([getTeamMembers(), getAllowedEmails()]),
      )

      if (!guardRef.current.isLatest(requestId)) return

      setMembers(m)
      setAllowedEmails(ae)
      hasLoadedRef.current = true
    } catch (err) {
      if (!guardRef.current.isLatest(requestId)) return

      if (isSessionExpiredError(err)) {
        await signOut().catch(() => {})
        navigate('/login?reason=session_expired', { replace: true })
        return
      }

      setError(getErrorMessage(err, 'Failed to load admin data.'))
    } finally {
      if (guardRef.current.isLatest(requestId)) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [navigate, profile, signOut])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Session not available. Please sign in again.
      </div>
    )
  }

  const readOnly = isSuperAdmin(profile.role)

  return (
    <div className="space-y-4">
      {refreshing && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Syncing latest admin data...
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="w-full">
          <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
          <TabsTrigger value="members" className="flex-1">Members</TabsTrigger>
          <TabsTrigger value="access" className="flex-1">Access</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <AdminOverviewTab members={members} allowedEmails={allowedEmails} />
        </TabsContent>

        <TabsContent value="members">
          <AdminMembersTab members={members} currentUserId={profile.id} onRefresh={refresh} readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="access">
          <AdminAccessTab
            allowedEmails={allowedEmails}
            members={members}
            currentUserId={profile.id}
            onRefresh={refresh}
            readOnly={readOnly}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
