import { useAuth } from '@/contexts/auth-context'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { RoleSwitcher } from '@/components/layout/role-switcher'

export function Header() {
  const { profile } = useAuth()

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur-md px-4">
      {/* Brand mark — mobile only (desktop has it in the sidebar) */}
      <div className="flex items-center gap-2.5 md:hidden">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold"
          style={{ background: 'var(--sidebar)', color: 'var(--sidebar-primary)' }}
        >
          1P
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-foreground">1PAX</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {profile?.role === 'super_admin' && <RoleSwitcher />}
        {profile && <NotificationBell />}
      </div>
    </header>
  )
}
