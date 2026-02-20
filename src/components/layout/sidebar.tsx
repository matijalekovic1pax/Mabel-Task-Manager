import { NavLink } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { hasAdminAccess, isSuperAdmin } from '@/lib/utils/roles'
import { LayoutDashboard, ListTodo, PlusCircle, Activity, Settings, Users, Shield, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, color: 'text-violet-500' },
  { to: '/tasks', label: 'Tasks', icon: ListTodo, color: 'text-blue-500' },
  { to: '/tasks/new', label: 'New Task', icon: PlusCircle, color: 'text-emerald-500' },
  { to: '/activity', label: 'Activity', icon: Activity, color: 'text-amber-500' },
  { to: '/settings', label: 'Settings', icon: Settings, color: 'text-slate-400' },
]

const ceoOnlyItems = [
  { to: '/admin', label: 'Admin Dashboard', icon: Shield, color: 'text-rose-500' },
  { to: '/settings/team', label: 'Team Management', icon: Users, color: 'text-pink-500' },
]

export function Sidebar() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const isAdmin = hasAdminAccess(profile?.role)
  const readOnly = isSuperAdmin(profile?.role)
  const visibleNavItems = readOnly ? navItems.filter((n) => n.to !== '/tasks/new') : navItems

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sign out')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r bg-card">
      <div className="flex h-14 items-center border-b px-4 gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-bold shadow-sm">
          M
        </div>
        <h1 className="text-lg font-semibold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Mabel</h1>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
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
        {isAdmin && (
          <>
            <Separator className="my-2" />
            {ceoOnlyItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
          </>
        )}
      </nav>
      <div className="border-t p-3">
        <div className="mb-2 flex items-center gap-3 px-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="h-8 w-8 rounded-full ring-2 ring-violet-200" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-medium text-white shadow-sm">
              {profile?.full_name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile?.full_name}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">{profile?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={signingOut}
          className="w-full justify-start gap-3 text-muted-foreground hover:text-red-600"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />Sign Out
        </Button>
      </div>
    </aside>
  )
}
