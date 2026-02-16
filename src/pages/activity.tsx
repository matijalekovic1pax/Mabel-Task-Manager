import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getActivityFeed } from '@/lib/services/activity'
import type { ActivityItem } from '@/lib/services/activity'
import { ActivityFeedItem } from '@/components/activity/activity-item'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'

const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000

export function ActivityPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<ActivityItem[]>([])
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
      const data = await withTimeout(getActivityFeed(50))
      if (!guardRef.current.isLatest(requestId)) return

      setItems(data)
      hasLoadedRef.current = true
    } catch (err) {
      if (!guardRef.current.isLatest(requestId)) return

      if (isSessionExpiredError(err)) {
        await signOut().catch(() => {})
        navigate('/login?reason=session_expired', { replace: true })
        return
      }

      setError(getErrorMessage(err, 'Failed to load activity.'))
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

  // Realtime: listen for new task_events inserts
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
      .channel(`activity-feed-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_events' },
        () => { scheduleRefresh({ background: true }) },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments' },
        () => { scheduleRefresh({ background: true }) },
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

    const handleOnline = () => { stopPolling(); scheduleRefresh({ background: true }) }
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-violet-500" />
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh({ background: true })}>
          Refresh
        </Button>
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
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : error && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground">Could not load activity.</p>
          <Button variant="outline" className="mt-3" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground">No activity yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Events will appear here as tasks are created, updated, and commented on.</p>
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {items.map((item) => (
            <ActivityFeedItem key={`${item.type}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
