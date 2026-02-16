import type { Profile } from '@/lib/types'

type UserRole = Profile['role']

/** Returns true if the role has admin-level access (CEO or super_admin). */
export function hasAdminAccess(role: UserRole | undefined): boolean {
  return role === 'ceo' || role === 'super_admin'
}

/** Returns true if the role is specifically the super_admin. */
export function isSuperAdmin(role: UserRole | undefined): boolean {
  return role === 'super_admin'
}
