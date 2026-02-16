import { AdminDashboardPanel } from '@/components/admin/admin-dashboard-panel'
import { Shield } from 'lucide-react'

export function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage users, roles, and access control</p>
        </div>
      </div>
      <AdminDashboardPanel />
    </div>
  )
}
