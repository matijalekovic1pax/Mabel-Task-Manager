import { useAuth } from '@/contexts/auth-context'
import type { Profile } from '@/lib/types'

type UserRole = Profile['role']

/** Returns the effective role for UI rendering — honours the super_admin view-as override. */
export function useEffectiveRole(): UserRole | null {
  const { effectiveRole } = useAuth()
  return effectiveRole
}

/** Returns true if the role has admin-level access (CEO or super_admin). */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role === 'ceo' || role === 'super_admin'
}

/** Returns true if the role is specifically the CEO (write-level admin access). */
export function isCeo(role: UserRole | null | undefined): boolean {
  return role === 'ceo'
}

/** Returns true if the role is specifically the super_admin (read-only admin). */
export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === 'super_admin'
}
