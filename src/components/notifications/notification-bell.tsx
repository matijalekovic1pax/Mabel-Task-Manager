import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
} from '@/lib/services/notifications'
import { supabase } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Bell } from 'lucide-react'
import { NotificationItem } from './notification-item'
import type { Notification } from '@/lib/types'
import { isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'

const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000

export function NotificationBell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  const guardRef = useRef(createRequestGuard())
  const refreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const requestId = guardRef.current.next()

    if (!profile) {
      if (!guardRef.current.isLatest(requestId)) return
      setNotifications([])
      setUnreadCount(0)
      return
    }

    try {
      const [items, count] = await withTimeout(
        Promise.all([
          getNotifications(profile.id, { limit: 5 }),
          getUnreadCount(profile.id),
        ]),
      )

      if (!guardRef.current.isLatest(requestId)) return

      setNotifications(items)
      setUnreadCount(count)
    } catch (err) {
      if (!guardRef.current.isLatest(requestId)) return

      if (isSessionExpiredError(err)) {
        await signOut().catch(() => {})
        navigate('/login?reason=session_expired', { replace: true })
      }
    }
  }, [navigate, profile, signOut])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      void refresh()
    }, REFRESH_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [refresh])

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!profile) return

    let pollIntervalId: number | null = null

    const startPolling = () => {
      if (pollIntervalId !== null) return
      pollIntervalId = window.setInterval(() => {
        scheduleRefresh()
      }, FALLBACK_POLL_MS)
    }

    const stopPolling = () => {
      if (pollIntervalId === null) return
      window.clearInterval(pollIntervalId)
      pollIntervalId = null
    }

    const channel = supabase
      .channel(`notifications-bell-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          scheduleRefresh()
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
      scheduleRefresh()
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
        setUnreadCount((c) => Math.max(0, c - 1))
        setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, is_read: true } : n))
      } catch {
        // Ignore optimistic update failures here; list refresh will reconcile state.
      }
    }
    setOpen(false)
    if (notification.task_id) {
      navigate(`/tasks/${notification.task_id}`)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications</p>
          ) : (
            notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} onClick={() => handleClick(n)} />
            ))
          )}
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              setOpen(false)
              navigate('/notifications')
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
