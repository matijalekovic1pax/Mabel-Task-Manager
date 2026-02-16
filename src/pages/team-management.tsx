import { TeamManagementPanel } from '@/components/settings/team-management-panel'

export function TeamManagementPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
      <TeamManagementPanel />
    </div>
  )
}
