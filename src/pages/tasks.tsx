import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getTasks,
  getMySubmittedTasks,
  getMyAssignedTasks,
  getMyAssignedGeneralTasks,
  getCompanyTasks,
  updateGeneralTaskStatus,
} from '@/lib/services/tasks'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskFilters } from '@/components/tasks/task-filters'
import { TaskPriorityBadge } from '@/components/tasks/task-priority-badge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getGreeting, formatDeadline, isOverdue } from '@/lib/utils/format'
import {
  PlusCircle, Clock, AlertTriangle, CheckCircle2, ListTodo,
  Loader2, Circle, PlayCircle, XCircle, Calendar, User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { TaskWithSubmitter, GeneralTaskStatus, TaskFilters as TF } from '@/lib/types'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const FINAL_STATUSES = ['approved', 'rejected', 'resolved']
const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000

const KANBAN_COLUMNS: { id: GeneralTaskStatus; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'todo',        label: 'To Do',       icon: Circle,       color: 'text-muted-foreground' },
  { id: 'in_progress', label: 'In Progress', icon: PlayCircle,   color: 'text-orange-500' },
  { id: 'done',        label: 'Done',        icon: CheckCircle2, color: 'text-emerald-600' },
  { id: 'cancelled',   label: 'Cancelled',  icon: XCircle,      color: 'text-red-400' },
]

const STATUS_TRANSITIONS: Record<GeneralTaskStatus, GeneralTaskStatus[]> = {
  todo:        ['in_progress', 'cancelled'],
  in_progress: ['done', 'todo', 'cancelled'],
  done:        [],
  cancelled:   [],
}

const STATUS_LABELS: Partial<Record<GeneralTaskStatus, string>> = {
  in_progress: 'Start',
  done:        'Mark Done',
  todo:        'Move to To Do',
  cancelled:   'Cancel',
}

const SORT_MAP: Record<string, { sortBy: TF['sortBy']; sortOrder: TF['sortOrder'] }> = {
  newest:   { sortBy: 'submitted_at', sortOrder: 'desc' },
  oldest:   { sortBy: 'submitted_at', sortOrder: 'asc' },
  deadline: { sortBy: 'deadline',     sortOrder: 'asc' },
  priority: { sortBy: 'priority',     sortOrder: 'asc' },
}

// ─────────────────────────────────────────────
// Kanban card (inline — general tasks)
// ─────────────────────────────────────────────

function KanbanCard({
  task,
  onStatusChange,
}: {
  task: TaskWithSubmitter
  onStatusChange: (id: string, status: GeneralTaskStatus) => Promise<void>
}) {
  const [updating, setUpdating] = useState(false)
  const currentStatus = task.status as GeneralTaskStatus
  const nextStatuses = STATUS_TRANSITIONS[currentStatus] ?? []
  const overdue = task.deadline
    ? isOverdue(task.deadline) && !['done', 'cancelled'].includes(task.status)
    : false

  async function handleTransition(status: GeneralTaskStatus) {
    setUpdating(true)
    try { await onStatusChange(task.id, status) }
    finally { setUpdating(false) }
  }

  return (
    <div className={cn(
      'rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md',
      currentStatus === 'done' && 'opacity-55',
    )}>
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/tasks/${task.id}`}
          className="min-w-0 flex-1 text-sm font-medium leading-snug hover:underline"
        >
          {task.title}
        </Link>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {task.submitter?.full_name ?? 'Unknown'}
        </span>
        {task.deadline && (
          <span className={cn('flex items-center gap-1', overdue && 'text-red-600 font-medium')}>
            {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
            {formatDeadline(task.deadline)}
          </span>
        )}
      </div>
      {nextStatuses.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              size="sm"
              variant="outline"
              disabled={updating}
              onClick={() => handleTransition(status)}
              className={cn(
                'h-6 px-2 text-xs',
                status === 'done'        && 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                status === 'cancelled'   && 'border-red-300 text-red-600 hover:bg-red-50',
                status === 'in_progress' && 'border-stone-300 text-stone-700 hover:bg-stone-50',
                status === 'todo'        && 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {updating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {STATUS_LABELS[status] ?? status}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function mergeTasks(...lists: TaskWithSubmitter[][]): TaskWithSubmitter[] {
  const byId = new Map<string, TaskWithSubmitter>()
  for (const list of lists) for (const task of list) byId.set(task.id, task)
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  )
}

// ─────────────────────────────────────────────
// Unified Tasks Page
// ─────────────────────────────────────────────

export function TasksPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, effectiveRole, signOut } = useAuth()
  const isSuperAdmin = effectiveRole === 'super_admin'

  const [approvalTasks, setApprovalTasks]   = useState<TaskWithSubmitter[]>([])
  const [assignedGeneral, setAssignedGeneral] = useState<TaskWithSubmitter[]>([])
  const [createdGeneral, setCreatedGeneral]   = useState<TaskWithSubmitter[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const [mainTab, setMainTab]       = useState<'general' | 'approvals'>('general')
  const [generalTab, setGeneralTab] = useState<'assigned' | 'created'>('assigned')

  const guardRef        = useRef(createRequestGuard())
  const refreshTimerRef = useRef<number | null>(null)
  const hasLoadedRef    = useRef(false)

  // Build approval filters from URL params
  const approvalFilters = useCallback((): TF => {
    const sort = searchParams.get('sort') || 'newest'
    const { sortBy, sortOrder } = SORT_MAP[sort] ?? SORT_MAP.newest
    return {
      status:    searchParams.get('status')   || undefined,
      category:  searchParams.get('category') || undefined,
      priority:  searchParams.get('priority') || undefined,
      search:    searchParams.get('search')   || undefined,
      sortBy,
      sortOrder,
    }
  }, [searchParams])

  const refresh = useCallback(async (options?: { background?: boolean }) => {
    const requestId = guardRef.current.next()
    const background = options?.background ?? false

    if (background || hasLoadedRef.current) setRefreshing(true)
    else setLoading(true)

    if (!profile) {
      if (!guardRef.current.isLatest(requestId)) return
      setLoading(false); setRefreshing(false); return
    }

    setError(null)

    try {
      const filters = approvalFilters()

      const [approval, assigned, created] = await withTimeout(Promise.all([
        // Approval tasks
        isSuperAdmin
          ? getTasks(filters)
          : Promise.all([
              getMySubmittedTasks(profile.id, filters),
              getMyAssignedTasks(profile.id, filters),
            ]).then(([s, a]) => mergeTasks(s, a)),
        // General tasks — assigned to me
        getMyAssignedGeneralTasks(profile.id),
        // General tasks — created by me
        getCompanyTasks({ submittedBy: profile.id }),
      ]))

      if (!guardRef.current.isLatest(requestId)) return

      setApprovalTasks(approval)
      setAssignedGeneral(assigned)
      setCreatedGeneral(created)
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
        setLoading(false); setRefreshing(false)
      }
    }
  }, [approvalFilters, isSuperAdmin, navigate, profile, signOut])

  const scheduleRefresh = useCallback((options?: { background?: boolean }) => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => void refresh(options), REFRESH_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => { void refresh() }, [refresh])

  // Realtime + polling
  useEffect(() => {
    if (!profile) return
    let pollIntervalId: number | null = null
    const startPolling = () => {
      if (pollIntervalId !== null) return
      pollIntervalId = window.setInterval(() => scheduleRefresh({ background: true }), FALLBACK_POLL_MS)
    }
    const stopPolling = () => {
      if (pollIntervalId === null) return
      window.clearInterval(pollIntervalId); pollIntervalId = null
    }
    const channel = supabase
      .channel(`tasks-unified-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        scheduleRefresh({ background: true })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { stopPolling(); return }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) startPolling()
      })
    const handleOnline  = () => { stopPolling(); scheduleRefresh({ background: true }) }
    const handleOffline = () => startPolling()
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

  async function handleGeneralStatusChange(taskId: string, status: GeneralTaskStatus) {
    try {
      await updateGeneralTaskStatus(taskId, status)
      toast.success(`Task moved to ${status.replace('_', ' ')}`)
      void refresh({ background: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  // ── Derived stats ──
  const openApprovals    = approvalTasks.filter((t) => !FINAL_STATUSES.includes(t.status)).length
  const pendingApprovals = approvalTasks.filter((t) => ['pending', 'in_review'].includes(t.status)).length
  const openGeneral      = assignedGeneral.filter((t) => !['done', 'cancelled'].includes(t.status)).length
  const doneCount        = [...assignedGeneral, ...createdGeneral].filter((t) => t.status === 'done').length

  const activeGeneralTasks = generalTab === 'assigned' ? assignedGeneral : createdGeneral

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="task-list grid grid-cols-2 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-none" />)}
        </div>
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-page-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground">Here's what needs your attention.</p>
        </div>
        <Button asChild className="hidden md:inline-flex bg-foreground text-background hover:bg-foreground/90">
          <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
        </Button>
      </div>

      {refreshing && (
        <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          <Loader2 className="h-4 w-4 animate-spin" />Syncing...
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Retry</Button>
        </div>
      )}

      {/* Stats */}
      <div className="task-list grid grid-cols-2 sm:grid-cols-4">
        {[
          { label: 'Open Approvals',  value: openApprovals,    icon: Clock },
          { label: 'Pending Review',  value: pendingApprovals, icon: AlertTriangle },
          { label: 'Active Tasks',    value: openGeneral,      icon: ListTodo },
          { label: 'Completed',       value: doneCount,        icon: CheckCircle2 },
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

      {/* Main tab switcher */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
        {(['general', 'approvals'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              mainTab === tab ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'general' ? 'General Tasks' : 'Approval Requests'}
            <Badge variant="secondary" className="ml-2 text-xs">
              {tab === 'general'
                ? assignedGeneral.length + createdGeneral.length
                : approvalTasks.length}
            </Badge>
          </button>
        ))}
      </div>

      {/* ── General Tasks ── */}
      {mainTab === 'general' && (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
            {(['assigned', 'created'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setGeneralTab(tab)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  generalTab === tab ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab === 'assigned' ? 'Assigned to Me' : 'Created by Me'}
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {tab === 'assigned' ? assignedGeneral.length : createdGeneral.length}
                </Badge>
              </button>
            ))}
          </div>

          {activeGeneralTasks.length === 0 ? (
            <div className="task-list">
              <div className="flex flex-col items-center gap-3 py-10">
                <p className="text-sm text-muted-foreground">
                  {generalTab === 'assigned'
                    ? 'No tasks assigned to you yet.'
                    : "You haven't created any general tasks yet."}
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/tasks/new">Create a task</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {KANBAN_COLUMNS.map((col) => {
                const colTasks = activeGeneralTasks.filter((t) => t.status === col.id)
                return (
                  <div key={col.id} className="space-y-2">
                    <div className="flex items-center gap-2 px-1 py-1">
                      <col.icon className={cn('h-3.5 w-3.5', col.color)} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {col.label}
                      </span>
                      <Badge variant="secondary" className="ml-auto text-xs">{colTasks.length}</Badge>
                    </div>
                    {colTasks.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground/40">Empty</p>
                    ) : (
                      colTasks.map((task) => (
                        <KanbanCard
                          key={task.id}
                          task={task}
                          onStatusChange={handleGeneralStatusChange}
                        />
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Approval Requests ── */}
      {mainTab === 'approvals' && (
        <div className="space-y-4">
          <TaskFilters />
          {approvalTasks.length === 0 ? (
            <div className="task-list">
              <div className="flex flex-col items-center gap-3 py-10">
                <p className="text-sm text-muted-foreground">No approval requests found.</p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/tasks/new">Submit a request</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="task-list">
              {approvalTasks.map((task) => <TaskCard key={task.id} task={task} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
