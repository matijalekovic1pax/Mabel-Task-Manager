import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { updateMemberRole, toggleMemberActive } from '@/lib/services/team'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/lib/types'

interface AdminMembersTabProps {
  members: Profile[]
  currentUserId: string
  onRefresh: () => void
}

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  team_member: 'Team Member',
  super_admin: 'Super Admin',
}

export function AdminMembersTab({ members, currentUserId, onRefresh }: AdminMembersTabProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    member: Profile | null
    newRole: string
  }>({ open: false, member: null, newRole: '' })
  const [saving, setSaving] = useState(false)

  function handleRoleSelect(member: Profile, newRole: string) {
    if (newRole === member.role) return
    setConfirmDialog({ open: true, member, newRole })
  }

  async function confirmRoleChange() {
    if (!confirmDialog.member) return
    setSaving(true)
    try {
      await updateMemberRole(
        confirmDialog.member.id,
        confirmDialog.newRole as 'ceo' | 'team_member' | 'super_admin',
      )
      toast.success(`${confirmDialog.member.full_name}'s role updated to ${ROLE_LABELS[confirmDialog.newRole]}`)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setSaving(false)
      setConfirmDialog({ open: false, member: null, newRole: '' })
    }
  }

  async function handleToggleActive(member: Profile) {
    try {
      await toggleMemberActive(member.id, !member.is_active)
      toast.success(member.is_active ? `${member.full_name} deactivated` : `${member.full_name} activated`)
      onRefresh()
    } catch {
      toast.error('Failed to update member status')
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No team members yet.</p>
          ) : (
            <div className="divide-y">
              {members.map((m) => {
                const isSelf = m.id === currentUserId
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.full_name} className="h-10 w-10 rounded-full" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-medium text-white">
                        {m.full_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{m.full_name}{isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}{m.department && ` · ${m.department}`}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!m.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      <Select
                        value={m.role}
                        onValueChange={(v) => handleRoleSelect(m, v)}
                        disabled={isSelf}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="team_member">Team Member</SelectItem>
                          <SelectItem value="ceo">CEO</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      {!isSelf && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleToggleActive(m)}
                        >
                          {m.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => { if (!open) setConfirmDialog({ open: false, member: null, newRole: '' }) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Change <strong>{confirmDialog.member?.full_name}</strong>&apos;s role from{' '}
              <strong>{ROLE_LABELS[confirmDialog.member?.role ?? '']}</strong> to{' '}
              <strong>{ROLE_LABELS[confirmDialog.newRole]}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, member: null, newRole: '' })} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirmRoleChange} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
