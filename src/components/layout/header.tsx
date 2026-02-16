import { useAuth } from '@/contexts/auth-context'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { MobileNav } from './mobile-nav'

export function Header() {
  const { profile } = useAuth()

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <MobileNav />
        <h1 className="text-lg font-semibold md:hidden">Mabel</h1>
      </div>
      <div className="flex items-center gap-3">
        {profile && <NotificationBell />}
      </div>
    </header>
  )
}
