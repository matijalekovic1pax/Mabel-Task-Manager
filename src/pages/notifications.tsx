import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '@/lib/services/notifications'
import { NotificationItem } from '@/components/notifications/notification-item'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Notification } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'

const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000

export function NotificationsPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardRef = useRef(createRequestGuard())
  const refreshTimerRef = useRef<number | null>(null)
  const hasLoadedRef = useRef(false)

  const refresh = useCallback(async (options?: { background?: boolean }) => {
    const requestId = guardRef.current.next()
    const background = options?.background ?? false

    if (background || hasLoadedRef.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    if (!profile) {
      if (!guardRef.current.isLatest(requestId)) return
      setLoading(false)
      setRefreshing(false)
      return
    }

    setError(null)

    try {
      const data = await withTimeout(getNotifications(profile.id))
      if (!guardRef.current.isLatest(requestId)) return

      setNotifications(data)
      hasLoadedRef.current = true
    } catch (err) {
      if (!guardRef.current.isLatest(requestId)) return

      if (isSessionExpiredError(err)) {
        await signOut().catch(() => {})
        navigate('/login?reason=session_expired', { replace: true })
        return
      }

      setError(getErrorMessage(err, 'Failed to load notifications.'))
    } finally {
      if (guardRef.current.isLatest(requestId)) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [navigate, profile, signOut])

  const scheduleRefresh = useCallback((options?: { background?: boolean }) => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      void refresh(options)
    }, REFRESH_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!profile) return

    let pollIntervalId: number | null = null

    const startPolling = () => {
      if (pollIntervalId !== null) return
      pollIntervalId = window.setInterval(() => {
        scheduleRefresh({ background: true })
      }, FALLBACK_POLL_MS)
    }

    const stopPolling = () => {
      if (pollIntervalId === null) return
      window.clearInterval(pollIntervalId)
      pollIntervalId = null
    }

    const channel = supabase
      .channel(`notifications-list-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          scheduleRefresh({ background: true })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          stopPolling()
          return
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPolling()
        }
      })

    const handleOnline = () => {
      stopPolling()
      scheduleRefresh({ background: true })
    }

    const handleOffline = () => {
      startPolling()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (!navigator.onLine) {
      startPolling()
    }

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
      stopPolling()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      supabase.removeChannel(channel)
    }
  }, [profile, scheduleRefresh])

  async function handleClick(notification: Notification) {
    if (!notification.is_read) {
      try {
        await withTimeout(markAsRead(notification.id))
        setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, is_read: true } : n))
      } catch {
        // Ignore optimistic update failures here; user can retry from list refresh.
      }
    }
    if (notification.task_id) {
      navigate(`/tasks/${notification.task_id}`)
    }
  }

  async function handleMarkAllRead() {
    if (!profile) return
    try {
      await withTimeout(markAllAsRead(profile.id))
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      toast.success('All notifications marked as read')
    } catch (err) {
      if (isSessionExpiredError(err)) {
        await signOut().catch(() => {})
        navigate('/login?reason=session_expired', { replace: true })
        return
      }
      toast.error(getErrorMessage(err, 'Failed to mark notifications as read'))
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

      {refreshing && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Syncing latest updates...
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : error && notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground">Could not load notifications.</p>
          <Button variant="outline" className="mt-3" onClick={() => void refresh()}>
            Retry
          </Button>
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
