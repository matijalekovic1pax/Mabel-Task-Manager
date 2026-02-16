import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import {
  getTeamMembers,
  getAllowedEmails,
  addAllowedEmail,
  removeAllowedEmail,
  toggleMemberActive,
} from '@/lib/services/team'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, UserPlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile, AllowedEmail } from '@/lib/types'

export function TeamManagementPanel() {
  const { profile } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [addingEmail, setAddingEmail] = useState(false)

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

  useEffect(() => { refresh() }, [refresh])

  async function handleAddEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const role = (formData.get('role') as string) || 'team_member'

    setAddingEmail(true)
    try {
      await addAllowedEmail(email, role as 'ceo' | 'team_member' | 'super_admin', profile.id)
      toast.success('Email added to allow list')
      e.currentTarget.reset()
      refresh()
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
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove email')
    }
  }

  async function handleToggleActive(memberId: string, currentActive: boolean) {
    try {
      await toggleMemberActive(memberId, !currentActive)
      toast.success(currentActive ? 'Member deactivated' : 'Member activated')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update member status')
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />Add Allowed Email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddEmail} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" name="email" type="email" placeholder="user@company.com" required />
            </div>
            <div className="w-40 space-y-2">
              <Label>Role</Label>
              <Select name="role" defaultValue="team_member">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team_member">Team Member</SelectItem>
                  <SelectItem value="ceo">CEO</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addingEmail}>
              {addingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Allowed Emails</CardTitle></CardHeader>
        <CardContent>
          {allowedEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allowed emails configured.</p>
          ) : (
            <div className="space-y-2">
              {allowedEmails.map((ae) => (
                <div key={ae.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{ae.email}</span>
                    <Badge variant="outline" className="capitalize text-xs">{ae.role.replace('_', ' ')}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveEmail(ae.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader><CardTitle>Team Members</CardTitle></CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-3">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.full_name} className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {m.full_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}{m.department && ` · ${m.department}`}</p>
                    </div>
                    <Badge variant="outline" className="capitalize text-xs">{m.role.replace('_', ' ')}</Badge>
                    {!m.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                  </div>
                  {m.id !== profile?.id && (
                    <Button variant="outline" size="sm" onClick={() => handleToggleActive(m.id, m.is_active)}>
                      {m.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
