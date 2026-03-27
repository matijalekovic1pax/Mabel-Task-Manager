import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Eye, EyeOff, ChevronDown, ShieldAlert } from 'lucide-react'
import type { Profile } from '@/lib/types'

type UserRole = Profile['role']

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  ceo: 'CEO',
  team_member: 'Team Member',
}

/**
 * Role Switcher — only visible when the real (actual DB) role is super_admin.
 * Lets the admin preview what each role sees in the UI without changing DB permissions.
 */
export function RoleSwitcher() {
  const { profile, viewAsRole, setViewAsRole } = useAuth()

  // Only render for actual super_admins, never for impersonated views
  if (profile?.role !== 'super_admin') return null

  const activeLabel = viewAsRole ? ROLE_LABELS[viewAsRole] : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={viewAsRole ? 'default' : 'outline'}
          size="sm"
          className={
            viewAsRole
              ? 'gap-1.5 bg-amber-500 text-white hover:bg-amber-600 border-amber-500'
              : 'gap-1.5 text-muted-foreground'
          }
        >
          <Eye className="h-3.5 w-3.5" />
          {viewAsRole ? `Viewing as: ${activeLabel}` : 'View as role'}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          UI preview — data is still super_admin
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setViewAsRole(null)}
          className={!viewAsRole ? 'bg-accent font-medium' : ''}
        >
          <ShieldAlert className="mr-2 h-4 w-4 text-amber-600" />
          Super Admin (my role)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setViewAsRole('ceo')}
          className={viewAsRole === 'ceo' ? 'bg-accent font-medium' : ''}
        >
          <Eye className="mr-2 h-4 w-4 text-orange-500" />
          CEO View
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setViewAsRole('team_member')}
          className={viewAsRole === 'team_member' ? 'bg-accent font-medium' : ''}
        >
          <Eye className="mr-2 h-4 w-4 text-amber-500" />
          Team Member View
        </DropdownMenuItem>
        {viewAsRole && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setViewAsRole(null)} className="text-amber-700">
              <EyeOff className="mr-2 h-4 w-4" />
              Exit preview
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Banner shown below the header when a view-as role is active.
 * Renders nothing if not impersonating.
 */
export function RoleSwitcherBanner() {
  const { profile, viewAsRole, setViewAsRole } = useAuth()

  if (profile?.role !== 'super_admin' || !viewAsRole) return null

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">UI preview:</span> Viewing as{' '}
          <span className="font-semibold">{ROLE_LABELS[viewAsRole]}</span> — Supabase data is
          still fetched with your real super_admin permissions.
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setViewAsRole(null)}
        className="shrink-0 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <EyeOff className="mr-1.5 h-3.5 w-3.5" />
        Exit preview
      </Button>
    </div>
  )
}
