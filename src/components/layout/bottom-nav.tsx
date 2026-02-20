import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { hasAdminAccess } from '@/lib/utils/roles'
import { LayoutDashboard, ListTodo, PlusCircle, Activity, Settings, Shield } from 'lucide-react'
import { cn } from '@/lib/utils/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
  isCenter?: boolean
}

const ceoItems: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/tasks/new', label: 'New', icon: PlusCircle, isCenter: true },
  { to: '/admin', label: 'Admin', icon: Shield },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const teamItems: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/tasks/new', label: 'New', icon: PlusCircle, isCenter: true },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  const { profile } = useAuth()
  const isAdmin = hasAdminAccess(profile?.role)
  const items = isAdmin ? ceoItems : teamItems

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-stretch">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex flex-1 items-stretch"
          >
            {({ isActive }) =>
              item.isCenter ? (
                <div className="flex flex-1 flex-col items-center justify-center -mt-5">
                  <div
                    className={cn(
                      'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all',
                      isActive
                        ? 'bg-gradient-to-br from-violet-600 to-indigo-700'
                        : 'bg-gradient-to-br from-violet-500 to-indigo-600'
                    )}
                  >
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="mt-1 text-[10px] font-medium text-muted-foreground">
                    {item.label}
                  </span>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
                  <div
                    className={cn(
                      'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                      isActive ? 'bg-violet-100' : ''
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-5 w-5 transition-colors',
                        isActive ? 'text-violet-600' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium transition-colors',
                      isActive ? 'text-violet-600' : 'text-muted-foreground'
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
