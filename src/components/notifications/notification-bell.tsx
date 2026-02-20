import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getActivityFeed, getRecentActivityCount } from '@/lib/services/activity'
import type { ActivityItem } from '@/lib/services/activity'
import { supabase } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Activity } from 'lucide-react'
import { isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'
import { formatRelativeTime } from '@/lib/utils/format'

const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000

const ACTION_LABELS: Record<string, string> = {
  approve: 'approved',
  reject: 'rejected',
  request_info: 'requested info on',
  provide_info: 'provided info on',
  delegate: 'delegated',
  defer: 'deferred',
  resolve: 'resolved',
  mark_ready: 'marked ready',
}

export function NotificationBell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [recentCount, setRecentCount] = useState(0)
  const [open, setOpen] = useState(false)

  const guardRef = useRef(createRequestGuard())
  const refreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const requestId = guardRef.current.next()

    if (!profile) {
      if (!guardRef.current.isLatest(requestId)) return
      setItems([])
      setRecentCount(0)
      return
    }

    try {
      const [feed, count] = await withTimeout(
        Promise.all([
          getActivityFeed(5),
          getRecentActivityCount(60),
        ]),
      )

      if (!guardRef.current.isLatest(requestId)) return

      setItems(feed)
      setRecentCount(count)
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
    const timeoutId = window.setTimeout(() => { void refresh() }, 0)
    return () => { window.clearTimeout(timeoutId) }
  }, [refresh])

  // Realtime subscription for new activity
  useEffect(() => {
    if (!profile) return

    let pollIntervalId: number | null = null

    const startPolling = () => {
      if (pollIntervalId !== null) return
      pollIntervalId = window.setInterval(() => { scheduleRefresh() }, FALLBACK_POLL_MS)
    }

    const stopPolling = () => {
      if (pollIntervalId === null) return
      window.clearInterval(pollIntervalId)
      pollIntervalId = null
    }

    const channel = supabase
      .channel(`activity-bell-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_events' },
        () => { scheduleRefresh() },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments' },
        () => { scheduleRefresh() },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { stopPolling(); return }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPolling()
        }
      })

    const handleOnline = () => { stopPolling(); scheduleRefresh() }
    const handleOffline = () => { startPolling() }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (!navigator.onLine) startPolling()

    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      stopPolling()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      supabase.removeChannel(channel)
    }
  }, [profile, scheduleRefresh])

  function getSummary(item: ActivityItem): string {
    if (item.type === 'comment') {
      return `${item.author.full_name} commented on ${item.task.reference_number}`
    }
    const verb = ACTION_LABELS[item.action] ?? item.action
    return `${item.actor.full_name} ${verb} ${item.task.reference_number}`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Activity className="h-5 w-5" />
          {recentCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-medium text-white">
              {recentCount > 9 ? '9+' : recentCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
          {recentCount > 0 && (
            <span className="text-xs text-muted-foreground">{recentCount} in last hour</span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No recent activity</p>
          ) : (
            items.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => {
                  setOpen(false)
                  navigate(`/tasks/${item.task_id}`)
                }}
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <p className="text-sm">{getSummary(item)}</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(item.created_at)}</p>
              </button>
            ))
          )}
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            asChild
          >
            <Link to="/activity" onClick={() => setOpen(false)}>
              View all activity
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
