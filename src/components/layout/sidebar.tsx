import { NavLink } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { hasAdminPanelAccess } from '@/lib/utils/roles'
import {
  ListTodo, PlusCircle, Activity,
  Settings, Shield, LogOut, CheckSquare,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Tasks', icon: ListTodo, end: true },
  { to: '/my-todos', label: 'My Todos', icon: CheckSquare },
  { to: '/links', label: 'Link Vault', icon: Link2 },
  { to: '/tasks/new', label: 'New Task', icon: PlusCircle },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const adminOnlyItems = [
  { to: '/admin', label: 'Admin', icon: Shield },
]

export function Sidebar() {
  const navigate = useNavigate()
  const { profile, effectiveRole, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const isAdmin = hasAdminPanelAccess(effectiveRole)

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

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <aside
      className="sidebar-grain relative hidden md:flex md:w-60 md:flex-col"
      style={{ background: 'var(--sidebar)' }}
    >
      {/* Brand */}
      <div className="flex h-14 items-center border-b px-5 gap-3" style={{ borderColor: 'var(--sidebar-border)' }}>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold"
          style={{ background: 'var(--sidebar-primary)', color: 'var(--sidebar-primary-foreground)' }}
        >
          1P
        </div>
        <span
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: 'var(--sidebar-primary)' }}
        >
          1PAX
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-3 pt-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'text-[var(--sidebar-primary-foreground)]'
                  : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]',
              )
            }
            style={({ isActive }) => isActive
              ? { background: 'var(--sidebar-primary)' }
              : undefined
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className="h-4 w-4 shrink-0"
                  style={{ opacity: isActive ? 1 : 0.5 }}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="my-3 px-3">
              <div className="h-px" style={{ background: 'var(--sidebar-border)' }} />
            </div>
            {adminOnlyItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'text-[var(--sidebar-primary-foreground)]'
                      : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]',
                  )
                }
                style={({ isActive }) => isActive
                  ? { background: 'var(--sidebar-primary)' }
                  : undefined
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className="h-4 w-4 shrink-0"
                      style={{ opacity: isActive ? 1 : 0.5 }}
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User profile */}
      <div className="p-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <div className="mb-1 flex items-center gap-3 rounded-md px-3 py-2">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              className="h-7 w-7 shrink-0 rounded-full ring-1"
              style={{ outline: '1px solid var(--sidebar-border)' }}
            />
          ) : (
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: 'var(--sidebar-accent)', color: 'var(--sidebar-primary)' }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" style={{ color: 'var(--sidebar-primary)' }}>
              {profile?.full_name}
            </p>
            <p className="truncate text-[10px] capitalize" style={{ color: 'var(--sidebar-foreground)', opacity: 0.6 }}>
              {profile?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
        <button
          disabled={signingOut}
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-all duration-150 hover:opacity-80 disabled:opacity-40"
          style={{ color: 'var(--sidebar-foreground)', opacity: 0.7 }}
        >
          <LogOut className="h-3.5 w-3.5" />
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </aside>
  )
}
