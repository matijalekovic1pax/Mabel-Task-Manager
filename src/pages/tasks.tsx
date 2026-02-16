import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getTasks,
  getMyAssignedTasks,
  getMySubmittedTasks,
} from '@/lib/services/tasks'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskFilters } from '@/components/tasks/task-filters'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PlusCircle, Loader2 } from 'lucide-react'
import { hasAdminAccess } from '@/lib/utils/roles'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'
import type { TaskWithSubmitter, TaskFilters as TF } from '@/lib/types'

const SORT_MAP: Record<string, { sortBy: TF['sortBy']; sortOrder: TF['sortOrder'] }> = {
  newest: { sortBy: 'submitted_at', sortOrder: 'desc' },
  oldest: { sortBy: 'submitted_at', sortOrder: 'asc' },
  deadline: { sortBy: 'deadline', sortOrder: 'asc' },
  priority: { sortBy: 'priority', sortOrder: 'asc' },
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000

function mergeAndSortTasks(
  submitted: TaskWithSubmitter[],
  assigned: TaskWithSubmitter[],
  sortBy: TF['sortBy'],
  sortOrder: TF['sortOrder'],
): TaskWithSubmitter[] {
  const merged = new Map<string, TaskWithSubmitter>()
  submitted.forEach((task) => merged.set(task.id, task))
  assigned.forEach((task) => merged.set(task.id, task))

  const list = Array.from(merged.values())

  list.sort((a, b) => {
    let cmp = 0

    if (sortBy === 'priority') {
      cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    } else if (sortBy === 'deadline') {
      const aValue = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER
      const bValue = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER
      cmp = aValue - bValue
    } else {
      const aValue = new Date(a[sortBy ?? 'submitted_at']).getTime()
      const bValue = new Date(b[sortBy ?? 'submitted_at']).getTime()
      cmp = aValue - bValue
    }

    return sortOrder === 'desc' ? -cmp : cmp
  })

  return list
}

export function TasksPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<TaskWithSubmitter[]>([])
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

    const status = searchParams.get('status') || undefined
    const category = searchParams.get('category') || undefined
    const priority = searchParams.get('priority') || undefined
    const search = searchParams.get('search') || undefined
    const sort = searchParams.get('sort') || 'newest'
    const view = searchParams.get('view') || 'all'
    const { sortBy, sortOrder } = SORT_MAP[sort] ?? SORT_MAP.newest

    const baseFilters: TF = {
      status,
      category,
      priority,
      search,
      sortBy,
      sortOrder,
    }

    setError(null)

    try {
      let data: TaskWithSubmitter[]

      if (hasAdminAccess(profile.role)) {
        data = await withTimeout(getTasks(baseFilters))
      } else if (view === 'submitted') {
        data = await withTimeout(getMySubmittedTasks(profile.id, baseFilters))
      } else if (view === 'assigned') {
        data = await withTimeout(getMyAssignedTasks(profile.id, baseFilters))
      } else {
        const [submitted, assigned] = await withTimeout(
          Promise.all([
            getMySubmittedTasks(profile.id, baseFilters),
            getMyAssignedTasks(profile.id, baseFilters),
          ]),
        )
        data = mergeAndSortTasks(submitted, assigned, sortBy, sortOrder)
      }

      if (!guardRef.current.isLatest(requestId)) return

      setTasks(data)
      hasLoadedRef.current = true
    } catch (err) {
      if (!guardRef.current.isLatest(requestId)) return

      if (isSessionExpiredError(err)) {
        await signOut().catch(() => {})
        navigate('/login?reason=session_expired', { replace: true })
        return
      }

      setError(getErrorMessage(err, 'Failed to load tasks.'))
    } finally {
      if (guardRef.current.isLatest(requestId)) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [navigate, profile, searchParams, signOut])

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
      .channel(`tasks-list-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        scheduleRefresh({ background: true })
      })
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

  function updateView(view: 'all' | 'submitted' | 'assigned') {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (view === 'all') {
        next.delete('view')
      } else {
        next.set('view', view)
      }
      return next
    })
  }

  const currentView = searchParams.get('view') || 'all'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        {!hasAdminAccess(profile?.role) && (
          <Button asChild>
            <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
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

      {!hasAdminAccess(profile?.role) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={currentView === 'all' ? 'default' : 'outline'} size="sm" onClick={() => updateView('all')}>
            All
          </Button>
          <Button variant={currentView === 'submitted' ? 'default' : 'outline'} size="sm" onClick={() => updateView('submitted')}>
            Submitted by Me
          </Button>
          <Button variant={currentView === 'assigned' ? 'default' : 'outline'} size="sm" onClick={() => updateView('assigned')}>
            Assigned to Me
          </Button>
        </div>
      )}

      <TaskFilters />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : error && tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground">Could not load tasks.</p>
          <Button variant="outline" className="mt-3" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground">No tasks found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
