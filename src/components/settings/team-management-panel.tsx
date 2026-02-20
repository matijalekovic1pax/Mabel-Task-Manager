import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import {
  getTeamMembers,
  getAllowedEmails,
  addAllowedEmail,
  removeAllowedEmail,
  toggleMemberActive,
  removeTeamMember,
} from '@/lib/services/team'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, UserPlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile, AllowedEmail } from '@/lib/types'
import { isSuperAdmin } from '@/lib/utils/roles'

export function TeamManagementPanel() {
  const { profile } = useAuth()
  const readOnly = isSuperAdmin(profile?.role)
  const [members, setMembers] = useState<Profile[]>([])
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [addingEmail, setAddingEmail] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [m, e] = await Promise.all([getTeamMembers(), getAllowedEmails()])
      setMembers(m)
      setAllowedEmails(e)
    } catch {
      toast.error('Failed to load team data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function handleAddEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return
    const form = e.currentTarget
    const formData = new FormData(form)
    const email = formData.get('email') as string
    const role = (formData.get('role') as string) || 'team_member'

    setAddingEmail(true)
    try {
      await addAllowedEmail(email, role as 'ceo' | 'team_member' | 'super_admin', profile.id)
      toast.success('Email added to allow list')
      form.reset()
      void refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add email')
    } finally {
      setAddingEmail(false)
    }
  }

  async function handleRemoveEmail(emailId: string) {
    try {
      await removeAllowedEmail(emailId)
      toast.success('Email removed')
      void refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove email')
    }
  }

  async function handleToggleActive(memberId: string, currentActive: boolean) {
    try {
      await toggleMemberActive(memberId, !currentActive)
      toast.success(currentActive ? 'Member deactivated' : 'Member activated')
      void refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update member status')
    }
  }

  async function handleDeleteMember() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await removeTeamMember(deleteTarget.id)
      toast.success(`${deleteTarget.full_name} has been removed`)
      setDeleteTarget(null)
      void refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Add allowed email */}
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5" />Invite a New User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddEmail} className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" name="email" type="email" placeholder="colleague@company.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select name="role" defaultValue="team_member">
                    <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="team_member">Team Member</SelectItem>
                      <SelectItem value="ceo">CEO</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={addingEmail} className="w-full sm:w-auto">
                {addingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Allowed emails */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Allowed Emails
            <span className="ml-2 text-sm font-normal text-muted-foreground">({allowedEmails.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {allowedEmails.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No allowed emails configured.</p>
          ) : (
            <div className="divide-y">
              {allowedEmails.map((ae) => (
                <div key={ae.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{ae.email}</p>
                    <Badge variant="outline" className="mt-1 capitalize text-xs">
                      {ae.role.replace('_', ' ')}
                    </Badge>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveEmail(ae.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Team members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Team Members
            <span className="ml-2 text-sm font-normal text-muted-foreground">({members.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No team members yet.</p>
          ) : (
            <div className="divide-y">
              {members.map((m) => {
                const isSelf = m.id === profile?.id
                return (
                  <div key={m.id} className="p-4 space-y-2">
                    {/* Identity */}
                    <div className="flex items-center gap-3 min-w-0">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.full_name} className="h-9 w-9 shrink-0 rounded-full" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
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
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline" className="capitalize text-xs">
                          {m.role.replace('_', ' ')}
                        </Badge>
                        {!m.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      </div>
                    </div>
                    {/* Actions */}
                    {!readOnly && !isSelf && (
                      <div className="flex items-center gap-2 pl-12">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleToggleActive(m.id, m.is_active)}
                        >
                          {m.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(m)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Permanently remove <strong>{deleteTarget?.full_name}</strong> from the team?
              They will lose all access and cannot sign in unless re-invited.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteMember} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
