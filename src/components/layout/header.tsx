import { useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { RoleSwitcher } from '@/components/layout/role-switcher'

function getMobileTitle(pathname: string): string {
  if (pathname === '/') return 'Tasks'
  if (pathname === '/tasks/new') return 'New Task'
  if (pathname.startsWith('/tasks/')) return 'Task Detail'
  if (pathname === '/my-todos') return 'My Todos'
  if (pathname === '/activity') return 'Activity'
  if (pathname === '/settings') return 'Settings'
  if (pathname === '/admin') return 'Admin'
  return '1PAX'
}

export function Header() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const mobileTitle = getMobileTitle(pathname)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-background/95 backdrop-blur-md px-4">
      {/* Mobile: logo mark + page title */}
      <div className="flex items-center gap-2.5 md:hidden">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
          style={{ background: 'var(--sidebar)', color: 'var(--sidebar-primary)' }}
        >
          1P
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {mobileTitle}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Role switcher — desktop only (use Settings page on mobile) */}
        {profile?.role === 'super_admin' && (
          <div className="hidden md:block">
            <RoleSwitcher />
          </div>
        )}
        {/* Notification bell — desktop only on mobile the Activity icon in the bottom nav serves this */}
        {profile && (
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        )}
      </div>
    </header>
  )
}
