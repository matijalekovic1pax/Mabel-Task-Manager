import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Menu, LayoutDashboard, ListTodo, PlusCircle, Bell, Settings, Users, LogOut } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, color: 'text-violet-500' },
  { to: '/tasks', label: 'Tasks', icon: ListTodo, color: 'text-blue-500' },
  { to: '/tasks/new', label: 'New Task', icon: PlusCircle, color: 'text-emerald-500' },
  { to: '/notifications', label: 'Notifications', icon: Bell, color: 'text-amber-500' },
  { to: '/settings', label: 'Settings', icon: Settings, color: 'text-slate-400' },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const isCeo = profile?.role === 'ceo'

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-14 items-center border-b px-4 gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-bold shadow-sm">
            M
          </div>
          <h2 className="text-lg font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Mabel</h2>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`h-4 w-4 ${isActive ? 'text-white' : item.color}`} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          {isCeo && (
            <>
              <Separator className="my-2" />
              <NavLink
                to="/settings/team"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Users className={`h-4 w-4 ${isActive ? 'text-white' : 'text-pink-500'}`} />
                    Team Management
                  </>
                )}
              </NavLink>
            </>
          )}
        </nav>
        <div className="border-t p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground hover:text-red-600" onClick={signOut}>
            <LogOut className="h-4 w-4" />Sign Out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
