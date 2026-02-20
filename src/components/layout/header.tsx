import { useAuth } from '@/contexts/auth-context'
import { NotificationBell } from '@/components/notifications/notification-bell'

export function Header() {
  const { profile } = useAuth()

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Brand mark — mobile only (desktop has it in the sidebar) */}
      <div className="flex items-center gap-2.5 md:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-bold shadow-sm">
          M
        </div>
        <span className="text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Mabel
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {profile && <NotificationBell />}
      </div>
    </header>
  )
}
