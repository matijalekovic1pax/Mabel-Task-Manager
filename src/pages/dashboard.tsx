import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getCeoQueue, getMyAssignedTasks, getMySubmittedTasks } from '@/lib/services/tasks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { hasAdminAccess } from '@/lib/utils/roles'
import type { TaskWithSubmitter } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'

const CATEGORY_COLORS: Record<string, string> = {
  financial: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  project: 'bg-blue-50 border-blue-200 text-blue-700',
  hr_operations: 'bg-purple-50 border-purple-200 text-purple-700',
  client_relations: 'bg-amber-50 border-amber-200 text-amber-700',
  pr_marketing: 'bg-pink-50 border-pink-200 text-pink-700',
  administrative: 'bg-slate-50 border-slate-200 text-slate-600',
}

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
  const { profile, signOut } = useAuth()
  const isCeo = hasAdminAccess(profile?.role)

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

    setError(null)

    try {
      const fetchPromise = isCeo
        ? getCeoQueue()
        : Promise.all([
            getMySubmittedTasks(profile.id),
            getMyAssignedTasks(profile.id),
          ]).then(([submitted, assigned]) => mergeTasks(submitted, assigned))

      const data = await withTimeout(fetchPromise)
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

      setError(getErrorMessage(err, 'Failed to load dashboard data.'))
    } finally {
      if (guardRef.current.isLatest(requestId)) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [isCeo, navigate, profile, signOut])

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
      <Card>
        <CardHeader>
          <CardTitle>Dashboard unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => void refresh()}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()},{' '}
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              {profile?.full_name?.split(' ')[0]}
            </span>
          </h1>
          <p className="text-muted-foreground">
            {isCeo ? 'CEO Decision Center' : 'Submitted and delegated tasks in one view.'}
          </p>
        </div>
        {!isCeo && (
          <Button asChild className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 shadow-md shadow-violet-200">
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

      {error && tasks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{isCeo ? 'Needs Decision' : 'Open Tasks'}</CardTitle>
            <div className="rounded-full bg-amber-50 p-2">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-600">{isCeo ? needsDecision.length : myOpen.length}</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{isCeo ? 'Waiting on Others' : 'Assigned to Me'}</CardTitle>
            <div className="rounded-full bg-red-50 p-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-600">{isCeo ? waitingOnOthers.length : myAssigned.length}</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{isCeo ? 'Due Today' : 'Submitted by Me'}</CardTitle>
            <div className="rounded-full bg-blue-50 p-2">
              <ListTodo className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-blue-600">{isCeo ? dueToday.length : mySubmitted.length}</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <div className="rounded-full bg-emerald-50 p-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-emerald-600">{completed.length}</p></CardContent>
        </Card>
      </div>

      {isCeo && categoryBreakdown.some((c) => c.count > 0) && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Needs Decision by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryBreakdown.filter((c) => c.count > 0).map((c) => (
                <div key={c.key} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${CATEGORY_COLORS[c.key] ?? ''}`}>
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-lg font-bold">{c.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isCeo ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Needs Decision</h2>
            {needsDecision.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-6 text-sm text-muted-foreground">No items currently require your decision.</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {needsDecision.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Waiting on Others</h2>
            {waitingOnOthers.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-6 text-sm text-muted-foreground">No tasks are currently blocked on team follow-up.</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {waitingOnOthers.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Completed</h2>
            {completed.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-6 text-sm text-muted-foreground">No completed tasks yet.</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {completed.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-lg font-semibold">My Recent Work</h2>
          {tasks.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="mb-4 rounded-full bg-violet-50 p-4">
                  <PlusCircle className="h-8 w-8 text-violet-400" />
                </div>
                <p className="mb-4 text-muted-foreground">No tasks yet. Submit your first task!</p>
                <Button asChild className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 shadow-md shadow-violet-200">
                  <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tasks.slice(0, 10).map((task) => <TaskCard key={task.id} task={task} />)}
              {tasks.length > 10 && (
                <Button variant="outline" asChild className="w-full">
                  <Link to="/tasks">View all tasks</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
