import { supabase } from '@/lib/supabase/client'
import type { NotificationInsert } from '@/lib/types'

// ---------------------------------------------------------------------------
// Options for listing notifications
// ---------------------------------------------------------------------------

export interface NotificationListOptions {
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Get notifications for a user
// ---------------------------------------------------------------------------

export async function getNotifications(
  userId: string,
  options?: NotificationListOptions,
) {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })

  if (options?.unreadOnly) {
    query = query.eq('is_read', false)
  }

  if (options?.limit) {
    const from = options.offset ?? 0
    query = query.range(from, from + options.limit - 1)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------------
// Get unread notification count
// ---------------------------------------------------------------------------

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)

  if (error) throw error
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Mark a single notification as read
// ---------------------------------------------------------------------------

export async function markAsRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Mark all notifications as read for a user
// ---------------------------------------------------------------------------

export async function markAllAsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Create a notification
// ---------------------------------------------------------------------------

export async function createNotification(
  data: Omit<NotificationInsert, 'id' | 'created_at' | 'is_read'>,
) {
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      recipient_id: data.recipient_id,
      type: data.type,
      title: data.title,
      message: data.message,
      task_id: data.task_id ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return notification
}
