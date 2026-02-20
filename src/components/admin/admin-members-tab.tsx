import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { updateMemberRole, toggleMemberActive, removeTeamMember } from '@/lib/services/team'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/lib/types'

interface AdminMembersTabProps {
  members: Profile[]
  currentUserId: string
  onRefresh: () => void
  readOnly?: boolean
}

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  team_member: 'Team Member',
  super_admin: 'Super Admin',
}

type ConfirmAction =
  | { type: 'role'; member: Profile; newRole: string }
  | { type: 'delete'; member: Profile }

export function AdminMembersTab({ members, currentUserId, onRefresh, readOnly = false }: AdminMembersTabProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [saving, setSaving] = useState(false)

  function handleRoleSelect(member: Profile, newRole: string) {
    if (newRole === member.role) return
    setConfirmAction({ type: 'role', member, newRole })
  }

  async function handleConfirm() {
    if (!confirmAction) return
    setSaving(true)
    try {
      if (confirmAction.type === 'role') {
        await updateMemberRole(
          confirmAction.member.id,
          confirmAction.newRole as 'ceo' | 'team_member' | 'super_admin',
        )
        toast.success(`${confirmAction.member.full_name}'s role updated to ${ROLE_LABELS[confirmAction.newRole]}`)
      } else {
        await removeTeamMember(confirmAction.member.id)
        toast.success(`${confirmAction.member.full_name} has been removed`)
      }
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setSaving(false)
      setConfirmAction(null)
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
                  <div key={m.id} className="p-4 space-y-3">
                    {/* Identity row */}
                    <div className="flex items-center gap-3 min-w-0">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.full_name} className="h-10 w-10 shrink-0 rounded-full" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-medium text-white">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {m.full_name}
                          {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.email}{m.department && ` · ${m.department}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!m.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                        {readOnly && (
                          <Badge variant="outline" className="capitalize text-xs">
                            {m.role.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Controls row */}
                    {!readOnly && (
                      <div className="flex flex-wrap items-center gap-2 pl-12">
                        <Select
                          value={m.role}
                          onValueChange={(v) => handleRoleSelect(m, v)}
                          disabled={isSelf}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="team_member">Team Member</SelectItem>
                            <SelectItem value="ceo">CEO</SelectItem>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        {!isSelf && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => handleToggleActive(m)}
                            >
                              {m.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmAction({ type: 'delete', member: m })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === 'delete' ? 'Remove Member' : 'Change Role'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'delete' ? (
                <>
                  Permanently remove <strong>{confirmAction.member.full_name}</strong> from the
                  team? They will lose all access and cannot sign in again unless re-invited.
                </>
              ) : confirmAction?.type === 'role' ? (
                <>
                  Change <strong>{confirmAction.member.full_name}</strong>&apos;s role from{' '}
                  <strong>{ROLE_LABELS[confirmAction.member.role]}</strong> to{' '}
                  <strong>{ROLE_LABELS[confirmAction.newRole]}</strong>?
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === 'delete' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmAction?.type === 'delete' ? 'Remove' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
