import { ProfileForm } from '@/components/settings/profile-form'

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <ProfileForm />
    </div>
  )
}
