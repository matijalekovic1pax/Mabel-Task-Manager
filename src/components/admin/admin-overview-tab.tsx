import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, UserCheck, UserX, Mail, Shield, UserCog } from 'lucide-react'
import type { Profile, AllowedEmail } from '@/lib/types'

interface AdminOverviewTabProps {
  members: Profile[]
  allowedEmails: AllowedEmail[]
}

export function AdminOverviewTab({ members, allowedEmails }: AdminOverviewTabProps) {
  const active = members.filter((m) => m.is_active).length
  const inactive = members.filter((m) => !m.is_active).length
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()))
  const pendingInvites = allowedEmails.filter((ae) => !memberEmails.has(ae.email.toLowerCase())).length

  const ceos = members.filter((m) => m.role === 'ceo').length
  const teamMembers = members.filter((m) => m.role === 'team_member').length
  const superAdmins = members.filter((m) => m.role === 'super_admin').length

  const stats = [
    { label: 'Total Users', value: members.length, icon: Users, color: 'border-violet-500', iconBg: 'bg-violet-100 text-violet-600' },
    { label: 'Active', value: active, icon: UserCheck, color: 'border-emerald-500', iconBg: 'bg-emerald-100 text-emerald-600' },
    { label: 'Inactive', value: inactive, icon: UserX, color: 'border-slate-400', iconBg: 'bg-slate-100 text-slate-600' },
    { label: 'Pending Invites', value: pendingInvites, icon: Mail, color: 'border-amber-500', iconBg: 'bg-amber-100 text-amber-600' },
  ]

  const roles = [
    { label: 'CEOs', value: ceos, icon: UserCog, color: 'text-blue-600' },
    { label: 'Team Members', value: teamMembers, icon: Users, color: 'text-emerald-600' },
    { label: 'Super Admins', value: superAdmins, icon: Shield, color: 'text-rose-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.color}`}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${s.iconBg}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Role Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {roles.map((r) => (
              <div key={r.label} className="flex items-center gap-3 rounded-md border p-3">
                <r.icon className={`h-5 w-5 ${r.color}`} />
                <div>
                  <p className="text-lg font-semibold">{r.value}</p>
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
