import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ListTodo, PlusCircle, CheckSquare, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
  isCenter?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/my-tasks', label: 'My Tasks', icon: CheckSquare },
  { to: '/tasks/new', label: 'New', icon: PlusCircle, isCenter: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  const items = navItems

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-md"
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
                      'flex h-14 w-14 items-center justify-center rounded-full shadow-md transition-all',
                      isActive ? 'bg-foreground' : 'bg-foreground/90'
                    )}
                  >
                    <item.icon className="h-6 w-6 text-background" />
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
                      isActive ? 'bg-foreground/8' : ''
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-5 w-5 transition-colors',
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium transition-colors',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
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
