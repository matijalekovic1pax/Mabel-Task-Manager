import { supabase } from '@/lib/supabase/client'
import type {
  LinkVaultItem,
  LinkVaultItemUpdate,
  LinkVaultItemWithCreator,
  LinkVaultResourceType,
} from '@/lib/types'

export type LinkVaultInput = {
  title: string
  url: string
  description?: string | null
  resource_type?: LinkVaultResourceType
  is_pinned?: boolean
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// ---------------------------------------------------------------------------
// Fetch shared vault links
// ---------------------------------------------------------------------------

export async function getLinkVaultItems(): Promise<LinkVaultItemWithCreator[]> {
  const { data, error } = await supabase
    .from('link_vault_items')
    .select('*, creator:profiles!link_vault_items_created_by_fkey(id, full_name, avatar_url, role)')
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as LinkVaultItemWithCreator[]
}

// ---------------------------------------------------------------------------
// Create a shared vault link
// ---------------------------------------------------------------------------

export async function createLinkVaultItem(
  userId: string,
  fields: LinkVaultInput,
): Promise<LinkVaultItemWithCreator> {
  const { data, error } = await supabase
    .from('link_vault_items')
    .insert({
      title: fields.title.trim(),
      url: normalizeUrl(fields.url),
      description: fields.description?.trim() || null,
      resource_type: fields.resource_type ?? 'other',
      created_by: userId,
      is_pinned: fields.is_pinned ?? false,
    })
    .select('*, creator:profiles!link_vault_items_created_by_fkey(id, full_name, avatar_url, role)')
    .single()

  if (error) throw error
  return data as unknown as LinkVaultItemWithCreator
}

// ---------------------------------------------------------------------------
// Update a shared vault link
// ---------------------------------------------------------------------------

export async function updateLinkVaultItem(
  id: string,
  updates: Partial<LinkVaultInput>,
): Promise<LinkVaultItemWithCreator> {
  const payload: LinkVaultItemUpdate = {}

  if (updates.title !== undefined) payload.title = updates.title.trim()
  if (updates.url !== undefined) payload.url = normalizeUrl(updates.url)
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null
  if (updates.resource_type !== undefined) payload.resource_type = updates.resource_type
  if (updates.is_pinned !== undefined) payload.is_pinned = updates.is_pinned

  const { data, error } = await supabase
    .from('link_vault_items')
    .update(payload)
    .eq('id', id)
    .select('*, creator:profiles!link_vault_items_created_by_fkey(id, full_name, avatar_url, role)')
    .single()

  if (error) throw error
  return data as unknown as LinkVaultItemWithCreator
}

// ---------------------------------------------------------------------------
// Delete a shared vault link
// ---------------------------------------------------------------------------

export async function deleteLinkVaultItem(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('link_vault_items')
    .delete()
    .eq('id', id)
    .select('id')
    .limit(1)

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Delete was blocked. You may not have permission to remove this link.')
  }
}

export function getLinkVaultDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function canManageLinkVaultItem(
  item: LinkVaultItem,
  userId: string | undefined,
  role: 'ceo' | 'team_member' | 'super_admin' | undefined,
): boolean {
  if (!userId || !role) return false
  return item.created_by === userId || role === 'ceo' || role === 'super_admin'
}
