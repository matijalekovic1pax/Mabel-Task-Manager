import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addAllowedEmail, removeAllowedEmail, updateAllowedEmailRole } from '@/lib/services/team'
import { UserPlus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AllowedEmail, Profile } from '@/lib/types'

interface AdminAccessTabProps {
  allowedEmails: AllowedEmail[]
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

export function AdminAccessTab({ allowedEmails, members, currentUserId, onRefresh, readOnly = false }: AdminAccessTabProps) {
  const [addingEmail, setAddingEmail] = useState(false)
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()))

  async function handleAddEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const email = formData.get('email') as string
    const role = (formData.get('role') as string) || 'team_member'

    setAddingEmail(true)
    try {
      await addAllowedEmail(email, role as 'ceo' | 'team_member' | 'super_admin', currentUserId)
      toast.success('Email added to allow list')
      form.reset()
      onRefresh()
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
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove email')
    }
  }

  async function handleRoleChange(emailId: string, newRole: string) {
    try {
      await updateAllowedEmailRole(emailId, newRole as 'ceo' | 'team_member' | 'super_admin')
      toast.success('Role updated')
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  return (
    <div className="space-y-6">
      {/* Add email form */}
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5" />
              Invite a New User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddEmail} className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="admin-email">Email Address</Label>
                  <Input
                    id="admin-email"
                    name="email"
                    type="email"
                    placeholder="colleague@company.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select name="role" defaultValue="team_member">
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
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

      {/* Allowed emails list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Allowed Emails
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({allowedEmails.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {allowedEmails.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No allowed emails configured.</p>
          ) : (
            <div className="divide-y">
              {allowedEmails.map((ae) => {
                const hasSignedUp = memberEmails.has(ae.email.toLowerCase())
                return (
                  <div key={ae.id} className="p-4 space-y-2">
                    {/* Email + status */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-sm font-medium">{ae.email}</span>
                      {hasSignedUp ? (
                        <Badge variant="outline" className="shrink-0 text-xs text-emerald-600 border-emerald-200">
                          Joined
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-xs text-amber-600 border-amber-200">
                          Pending
                        </Badge>
                      )}
                    </div>
                    {/* Controls */}
                    {readOnly ? (
                      <Badge variant="outline" className="capitalize text-xs">
                        {ae.role.replace('_', ' ')}
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select
                          value={ae.role}
                          onValueChange={(v) => handleRoleChange(ae.id, v)}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue>{ROLE_LABELS[ae.role]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="team_member">Team Member</SelectItem>
                            <SelectItem value="ceo">CEO</SelectItem>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveEmail(ae.id)}
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
    </div>
  )
}
