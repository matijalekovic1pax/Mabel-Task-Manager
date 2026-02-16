import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getTeamMembers, getAllowedEmails } from '@/lib/services/team'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminOverviewTab } from './admin-overview-tab'
import { AdminMembersTab } from './admin-members-tab'
import { AdminAccessTab } from './admin-access-tab'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile, AllowedEmail } from '@/lib/types'

export function AdminDashboardPanel() {
  const { profile } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [m, ae] = await Promise.all([getTeamMembers(), getAllowedEmails()])
      setMembers(m)
      setAllowedEmails(ae)
    } catch {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="members">Team Members</TabsTrigger>
        <TabsTrigger value="access">Access Control</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <AdminOverviewTab members={members} allowedEmails={allowedEmails} />
      </TabsContent>

      <TabsContent value="members">
        <AdminMembersTab members={members} currentUserId={profile!.id} onRefresh={refresh} />
      </TabsContent>

      <TabsContent value="access">
        <AdminAccessTab
          allowedEmails={allowedEmails}
          members={members}
          currentUserId={profile!.id}
          onRefresh={refresh}
        />
      </TabsContent>
    </Tabs>
  )
}
