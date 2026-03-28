import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getCeoQueue, getMyAssignedTasks, getMySubmittedTasks, getMyAssignedGeneralTasks } from '@/lib/services/tasks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskCard } from '@/components/tasks/task-card'
import { getGreeting, isOverdue } from '@/lib/utils/format'
import { CATEGORY_CONFIG } from '@/lib/utils/constants'
import {
  PlusCircle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  Loader2,
} from 'lucide-react'
import type { TaskWithSubmitter } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'
import { cn } from '@/lib/utils'

const FINAL_STATUSES = ['approved', 'rejected', 'resolved']
const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000

function mergeTasks(...lists: TaskWithSubmitter[][]): TaskWithSubmitter[] {
  const byId = new Map<string, TaskWithSubmitter>()

  for (const list of lists) {
    for (const task of list) {
      byId.set(task.id, task)
    }
  }

  return Array.from(byId.values()).sort((a, b) => (
    new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  ))
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { profile, effectiveRole, signOut } = useAuth()
  const isSuperAdmin = effectiveRole === 'super_admin'

  const [tasks, setTasks] = useState<TaskWithSubmitter[]>([])
  const [generalTasks, setGeneralTasks] = useState<TaskWithSubmitter[]>([])
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
      const fetchPromise = isSuperAdmin
        ? getCeoQueue()
        : Promise.all([
            getMySubmittedTasks(profile.id),
            getMyAssignedTasks(profile.id),
          ]).then(([submitted, assigned]) => mergeTasks(submitted, assigned))

      const [data, myGeneral] = await withTimeout(
        Promise.all([fetchPromise, getMyAssignedGeneralTasks(profile.id)]),
      )
      if (!guardRef.current.isLatest(requestId)) return

      setTasks(data)
      setGeneralTasks(myGeneral)
      hasLoadedRef.current = true
    } catch (err) {
      if (!guardRef.current.isLatest(requestId)) return

      if (isSessionExpiredError(err)) {
        await signOut().catch(() => {})
        navigate('/login?reason=session_expired', { replace: true })
        return
      }

      setError(getErrorMessage(err, 'Failed to load dashboard data.'))
    } finally {
      if (guardRef.current.isLatest(requestId)) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [isSuperAdmin, navigate, profile, signOut])

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
      .channel(`dashboard-tasks-${profile.id}`)
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

  const needsDecision = tasks.filter((t) => (
    t.status === 'pending'
    || t.status === 'in_review'
    || (t.status === 'deferred' && isOverdue(t.deadline))
  ))
  const waitingOnOthers = tasks.filter((t) => (
    t.status === 'needs_more_info'
    || t.status === 'delegated'
    || (t.status === 'deferred' && !isOverdue(t.deadline))
  ))
  const completed = tasks.filter((t) => FINAL_STATUSES.includes(t.status))

  const myOpen = tasks.filter((t) => !FINAL_STATUSES.includes(t.status))
  const mySubmitted = tasks.filter((t) => t.submitted_by === profile?.id)
  const myAssigned = tasks.filter((t) => t.assigned_to === profile?.id)

  const dueToday = tasks.filter((t) => {
    if (!t.deadline) return false
    const d = new Date(t.deadline)
    const now = new Date()
    return d.toDateString() === now.toDateString() && !FINAL_STATUSES.includes(t.status)
  })

  const categoryBreakdown = Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({
    key,
    label: config.label,
    count: needsDecision.filter((t) => t.category === key).length,
  }))

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error && tasks.length === 0) {
    return (
      <div className="task-list">
        <div className="flex flex-col gap-3 px-5 py-8">
          <p className="text-sm font-semibold">Dashboard unavailable</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button size="sm" className="w-fit" onClick={() => void refresh()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {getGreeting()}, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin ? 'CEO Decision Center' : 'Your tasks and requests in one view.'}
          </p>
        </div>
        <Button asChild className="hidden md:inline-flex bg-foreground text-background hover:bg-foreground/90">
          <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
        </Button>
      </div>

      {refreshing && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Syncing latest updates...
        </div>
      )}

      {error && tasks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}

      {/* Unified stats block */}
      <div className="task-list grid grid-cols-2 sm:grid-cols-4">
        {[
          { label: isSuperAdmin ? 'Needs Decision' : 'Open Tasks',    value: isSuperAdmin ? needsDecision.length    : myOpen.length,      icon: Clock },
          { label: isSuperAdmin ? 'Waiting on Others' : 'Assigned',   value: isSuperAdmin ? waitingOnOthers.length  : myAssigned.length,  icon: AlertTriangle },
          { label: isSuperAdmin ? 'Due Today' : 'Submitted',          value: isSuperAdmin ? dueToday.length         : mySubmitted.length, icon: ListTodo },
          { label: 'Completed',                                  value: completed.length,                                     icon: CheckCircle2 },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className={cn(
              'px-6 py-5',
              i > 0 && 'border-l border-border/60',
              i >= 2 && 'border-t border-border/60 sm:border-t-0',
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{stat.label}</p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {isSuperAdmin && categoryBreakdown.some((c) => c.count > 0) && (
        <div className="task-list">
          {categoryBreakdown.filter((c) => c.count > 0).map((c) => (
            <div key={c.key} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-medium text-foreground/80">{c.label}</span>
              <span className="text-sm font-bold tabular-nums">{c.count}</span>
            </div>
          ))}
        </div>
      )}

      {isSuperAdmin ? (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">Needs Decision</h2>
            <div className="task-list">
              {needsDecision.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No items currently require your decision.</p>
              ) : (
                needsDecision.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">Waiting on Others</h2>
            <div className="task-list">
              {waitingOnOthers.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No tasks blocked on follow-up.</p>
              ) : (
                waitingOnOthers.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </section>

          {completed.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">Completed</h2>
              <div className="task-list">
                {completed.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {generalTasks.length > 0 && (
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">Assigned to Me</h2>
                <Link to="/my-tasks" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  View all
                </Link>
              </div>
              <div className="task-list">
                {generalTasks.slice(0, 5).map((task) => <TaskCard key={task.id} task={task} />)}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">My Approval Requests</h2>
            {tasks.length === 0 ? (
              <div className="task-list">
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <p className="text-sm text-muted-foreground">No requests yet.</p>
                  <Button asChild size="sm" className="hidden bg-foreground text-background hover:bg-foreground/90 md:inline-flex">
                    <Link to="/tasks/new"><PlusCircle className="mr-2 h-3.5 w-3.5" />New Task</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="task-list">
                {tasks.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)}
                {tasks.length > 10 && (
                  <Link
                    to="/tasks"
                    className="block px-5 py-3 text-center text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  >
                    View all {tasks.length} tasks
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
