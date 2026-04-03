import { NavLink } from 'react-router-dom'
import { LayoutDashboard, PlusCircle, Activity, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Tasks', icon: LayoutDashboard, end: true },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/tasks/new', label: 'New', icon: PlusCircle, isNew: true },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/96 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-stretch">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex flex-1 items-stretch"
          >
            {({ isActive }) =>
              item.isNew ? (
                /* ── New Task — prominent filled button ── */
                <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150',
                      isActive
                        ? 'bg-foreground scale-95'
                        : 'bg-foreground/90 shadow-sm',
                    )}
                  >
                    <item.icon className="h-5 w-5 text-background" />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium transition-colors',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              ) : (
                /* ── Standard tab ── */
                <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
                  <div
                    className={cn(
                      'flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-150',
                      isActive ? 'bg-foreground/8' : '',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-5 w-5 transition-colors duration-150',
                        isActive ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium transition-colors duration-150',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
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
