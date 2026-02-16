import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getNotifications, markAsRead, markAllAsRead } from '@/lib/services/notifications'
import { NotificationItem } from '@/components/notifications/notification-item'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { Notification } from '@/lib/types'

export function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!profile) return
    try {
      const data = await getNotifications(profile.id)
      setNotifications(data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { refresh() }, [refresh])

  async function handleClick(notification: Notification) {
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id)
        setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, is_read: true } : n))
      } catch {
        // ignore
      }
    }
    if (notification.task_id) {
      navigate(`/tasks/${notification.task_id}`)
    }
  }

  async function handleMarkAllRead() {
    if (!profile) return
    try {
      await markAllAsRead(profile.id)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      toast.success('All notifications marked as read')
    } catch {
      toast.error('Failed to mark notifications as read')
    }
  }

  const hasUnread = notifications.some((n) => !n.is_read)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        {hasUnread && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="mr-2 h-4 w-4" />Mark all read
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClick={() => handleClick(n)} />
          ))}
        </div>
      )}
    </div>
  )
}
