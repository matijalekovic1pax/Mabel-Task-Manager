import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getMySubmittedTasks,
  getMyAssignedTasks,
  getMyAssignedGeneralTasks,
  getCompanyTasks,
  updateGeneralTaskStatus,
} from '@/lib/services/tasks'
import { TaskStatusBadge } from '@/components/tasks/task-status-badge'
import { TaskPriorityBadge } from '@/components/tasks/task-priority-badge'
import { TaskCategoryIcon } from '@/components/tasks/task-category-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { getGreeting, formatDeadline, isOverdue } from '@/lib/utils/format'
import { CATEGORY_CONFIG, PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/utils/constants'
import {
  PlusCircle, AlertTriangle, CheckCircle2, Loader2,
  Circle, PlayCircle, X, Inbox, Pencil, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { TaskWithSubmitter, GeneralTaskStatus } from '@/lib/types'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const FINAL_STATUSES = ['approved', 'rejected', 'resolved', 'done', 'cancelled']
const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

const STATUS_TRANSITIONS: Record<GeneralTaskStatus, GeneralTaskStatus[]> = {
  todo:        ['in_progress', 'cancelled'],
  in_progress: ['done', 'todo', 'cancelled'],
  done:        [],
  cancelled:   [],
}

const STATUS_ACTION_LABELS: Partial<Record<GeneralTaskStatus, string>> = {
  in_progress: 'Start',
  done:        'Mark Done',
  todo:        'Reopen',
  cancelled:   'Cancel',
}

const PRIORITY_STRIPE: Record<string, string> = {
  urgent: 'border-l-[3px] border-l-red-500',
  high:   'border-l-[3px] border-l-orange-400',
  normal: 'border-l-[3px] border-l-transparent',
  low:    'border-l-[3px] border-l-transparent',
}

function dedupe(tasks: TaskWithSubmitter[]): TaskWithSubmitter[] {
  const map = new Map<string, TaskWithSubmitter>()
  for (const t of tasks) map.set(t.id, t)
  return Array.from(map.values())
}

// ─────────────────────────────────────────────
// Unified task row
// ─────────────────────────────────────────────

function TaskRow({
  task,
  onStatusChange,
}: {
  task: TaskWithSubmitter
  onStatusChange: (id: string, status: GeneralTaskStatus) => Promise<void>
}) {
  const [updating, setUpdating] = useState(false)
  const isGeneral = task.task_type === 'general'
  const currentStatus = task.status as GeneralTaskStatus
  const nextStatuses = isGeneral ? (STATUS_TRANSITIONS[currentStatus] ?? []) : []
  const overdue = task.deadline
    ? isOverdue(task.deadline) && !FINAL_STATUSES.includes(task.status)
    : false
  const isUrgentActive = task.priority === 'urgent' && !FINAL_STATUSES.includes(task.status)
  const isFinal = FINAL_STATUSES.includes(task.status)

  async function handleTransition(status: GeneralTaskStatus) {
    setUpdating(true)
    try { await onStatusChange(task.id, status) }
    finally { setUpdating(false) }
  }

  const inner = (
    <div className={cn(
      'flex items-start gap-4 px-5 py-3.5 transition-colors duration-100',
      PRIORITY_STRIPE[task.priority],
      overdue          && 'bg-red-50/50',
      isUrgentActive && !overdue && 'bg-orange-50/25',
      isFinal          && 'opacity-55',
      !isGeneral       && 'group hover:bg-accent/50 cursor-pointer',
    )}>
      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className={cn(
            'inline-block shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
            isGeneral
              ? 'text-sky-600 bg-sky-50'
              : 'text-violet-600 bg-violet-50',
          )}>
            {isGeneral ? 'Task' : 'Approval'}
          </span>
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
          {overdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              <AlertTriangle className="h-2.5 w-2.5" />Overdue
            </span>
          )}
        </div>

        {/* Title */}
        {isGeneral ? (
          <Link
            to={`/tasks/${task.id}`}
            onClick={e => e.stopPropagation()}
            className="text-sm font-medium leading-snug hover:underline underline-offset-2"
          >
            {task.title}
          </Link>
        ) : (
          <p className="text-sm font-medium leading-snug group-hover:text-foreground/80 transition-colors">
            {task.title}
          </p>
        )}

        {/* Meta */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <TaskCategoryIcon category={task.category} className="h-3 w-3 opacity-40" />
            {CATEGORY_CONFIG[task.category].label}
          </span>
          <span>by {task.submitter?.full_name ?? 'Unknown'}</span>
          <span className="font-mono-refined text-muted-foreground/35">{task.reference_number}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {task.deadline && (
          <span className={cn(
            'flex items-center gap-1 text-xs whitespace-nowrap',
            overdue ? 'text-red-600 font-medium' : 'text-muted-foreground/55',
          )}>
            {overdue && <AlertTriangle className="h-3 w-3" />}
            {formatDeadline(task.deadline)}
          </span>
        )}
        {isGeneral && nextStatuses.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-end">
            {nextStatuses.map(s => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                disabled={updating}
                onClick={e => { e.stopPropagation(); void handleTransition(s) }}
                className={cn(
                  'h-6 px-2 text-xs',
                  s === 'done'        && 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                  s === 'cancelled'   && 'border-red-300 text-red-600 hover:bg-red-50',
                  s === 'in_progress' && 'border-orange-300 text-orange-700 hover:bg-orange-50',
                  s === 'todo'        && 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {updating && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                {STATUS_ACTION_LABELS[s] ?? s}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (!isGeneral) {
    return <Link to={`/tasks/${task.id}`} className="block">{inner}</Link>
  }
  return <div>{inner}</div>
}

// ─────────────────────────────────────────────
// Tasks Page
// ─────────────────────────────────────────────

export function TasksPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  const [submittedApproval, setSubmittedApproval] = useState<TaskWithSubmitter[]>([])
  const [assignedApproval, setAssignedApproval]   = useState<TaskWithSubmitter[]>([])
  const [assignedGeneral, setAssignedGeneral]     = useState<TaskWithSubmitter[]>([])
  const [createdGeneral, setCreatedGeneral]       = useState<TaskWithSubmitter[]>([])
  const [loading, setLoading]                     = useState(true)
  const [refreshing, setRefreshing]               = useState(false)
  const [error, setError]                         = useState<string | null>(null)

  // Global view toggle
  const [view, setView] = useState<'assigned' | 'created'>('assigned')

  // Filters — client-side
  const [search, setSearch]                 = useState('')
  const [filterStatus, setFilterStatus]     = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [sortMode, setSortMode]             = useState('priority')

  const guardRef        = useRef(createRequestGuard())
  const refreshTimerRef = useRef<number | null>(null)
  const hasLoadedRef    = useRef(false)

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
      const [submitted, assigned, assignedGen, createdGen] = await withTimeout(Promise.all([
        getMySubmittedTasks(profile.id),
        getMyAssignedTasks(profile.id),
        getMyAssignedGeneralTasks(profile.id),
        getCompanyTasks({ submittedBy: profile.id }),
      ]))

      if (!guardRef.current.isLatest(requestId)) return

      setSubmittedApproval(submitted)
      setAssignedApproval(assigned)
      setAssignedGeneral(assignedGen)
      setCreatedGeneral(createdGen)
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
  }, [navigate, profile, signOut])

  const scheduleRefresh = useCallback((options?: { background?: boolean }) => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => void refresh(options), REFRESH_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => { void refresh() }, [refresh])

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

  // ── Base tasks per view (pre-filter, for stats + toggle counts) ──
  const assignedBase = useMemo(
    () => dedupe([...assignedApproval, ...assignedGeneral]),
    [assignedApproval, assignedGeneral],
  )
  const createdBase = useMemo(
    () => dedupe([...submittedApproval, ...createdGeneral]),
    [submittedApproval, createdGeneral],
  )
  const baseTasks = view === 'assigned' ? assignedBase : createdBase

  // ── Stats (from pre-filter base) ──
  const stats = useMemo(() => ({
    open:       baseTasks.filter(t => !FINAL_STATUSES.includes(t.status)).length,
    urgent:     baseTasks.filter(t => t.priority === 'urgent' && !FINAL_STATUSES.includes(t.status)).length,
    inProgress: baseTasks.filter(t => ['in_progress', 'in_review', 'pending'].includes(t.status)).length,
    done:       baseTasks.filter(t => FINAL_STATUSES.includes(t.status)).length,
  }), [baseTasks])

  // ── Filtered + sorted tasks ──
  const activeTasks = useMemo(() => {
    let tasks = [...baseTasks]

    if (search.trim()) {
      const q = search.toLowerCase()
      tasks = tasks.filter(t => t.title.toLowerCase().includes(q))
    }
    if (filterStatus !== 'all')   tasks = tasks.filter(t => t.status === filterStatus)
    if (filterPriority !== 'all') tasks = tasks.filter(t => t.priority === filterPriority)
    if (filterCategory !== 'all') tasks = tasks.filter(t => t.category === filterCategory)

    tasks.sort((a, b) => {
      if (sortMode === 'priority') {
        const pa = PRIORITY_ORDER[a.priority] ?? 99
        const pb = PRIORITY_ORDER[b.priority] ?? 99
        if (pa !== pb) return pa - pb
        // secondary: overdue first
        const ao = a.deadline && isOverdue(a.deadline) ? 0 : 1
        const bo = b.deadline && isOverdue(b.deadline) ? 0 : 1
        if (ao !== bo) return ao - bo
        // tertiary: nearest deadline
        if (a.deadline && b.deadline)
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      }
      if (sortMode === 'deadline') {
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      }
      if (sortMode === 'oldest')
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    })

    return tasks
  }, [baseTasks, search, filterStatus, filterPriority, filterCategory, sortMode])

  const hasFilters = search || filterStatus !== 'all' || filterPriority !== 'all' || filterCategory !== 'all'

  function clearFilters() {
    setSearch(''); setFilterStatus('all'); setFilterPriority('all'); setFilterCategory('all')
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-11 w-72 rounded-xl" />
        <div className="task-list grid grid-cols-2 sm:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-none" />)}
        </div>
        <div className="flex gap-2">
          {[180, 112, 100, 120, 110].map((w, i) => <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />)}
        </div>
        <div className="task-list">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[72px] rounded-none border-b border-border/40" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-page-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here's what needs your attention.
          </p>
        </div>
        <Button
          asChild
          className="hidden md:inline-flex shrink-0 bg-foreground text-background hover:bg-foreground/90"
        >
          <Link to="/tasks/new">
            <PlusCircle className="mr-2 h-4 w-4" />New Task
          </Link>
        </Button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Retry</Button>
        </div>
      )}

      {/* ── Global view toggle ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-xl bg-muted p-1 gap-0.5">
          {(['assigned', 'created'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150',
                view === v
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'assigned'
                ? <Inbox className="h-4 w-4 shrink-0" />
                : <Pencil className="h-4 w-4 shrink-0" />}
              {v === 'assigned' ? 'Assigned to Me' : 'Created by Me'}
              <span className={cn(
                'text-xs font-normal tabular-nums',
                view === v ? 'text-muted-foreground' : 'opacity-40',
              )}>
                {v === 'assigned' ? assignedBase.length : createdBase.length}
              </span>
            </button>
          ))}
        </div>
        {refreshing && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Loader2 className="h-3 w-3 animate-spin" />Syncing
          </span>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="task-list grid grid-cols-2 sm:grid-cols-4">
        {[
          { label: 'Open Tasks',  value: stats.open,       icon: Circle,       urgent: false },
          { label: 'Urgent',      value: stats.urgent,     icon: AlertTriangle, urgent: stats.urgent > 0 },
          { label: 'In Progress', value: stats.inProgress, icon: PlayCircle,   urgent: false },
          { label: 'Completed',   value: stats.done,       icon: CheckCircle2, urgent: false },
        ].map((s, i) => (
          <div
            key={s.label}
            className={cn(
              'px-6 py-5',
              i > 0 && 'border-l border-border/60',
              i >= 2 && 'border-t border-border/60 sm:border-t-0',
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/55">
              {s.label}
            </p>
            <p className={cn(
              'mt-1.5 text-3xl font-bold tracking-tight',
              s.urgent ? 'text-red-600' : 'text-foreground',
            )}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/45 pointer-events-none" />
          <Input
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-8 w-28 text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortMode} onValueChange={setSortMode}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">By Priority</SelectItem>
            <SelectItem value="deadline">By Deadline</SelectItem>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}
      </div>

      {/* ── Task count row ── */}
      <div className="flex items-center justify-between -mt-1">
        <p className="text-xs text-muted-foreground/60">
          {activeTasks.length === 0
            ? 'No tasks'
            : `${activeTasks.length} ${activeTasks.length === 1 ? 'task' : 'tasks'}`}
          {hasFilters && ' · filtered'}
        </p>
      </div>

      {/* ── Task list ── */}
      {activeTasks.length === 0 ? (
        <div className="task-list">
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'No tasks match your filters.'
                : view === 'assigned'
                  ? 'No tasks assigned to you yet.'
                  : "You haven't created any tasks yet."}
            </p>
            {!hasFilters && (
              <Button asChild size="sm" variant="outline">
                <Link to="/tasks/new">Create a task</Link>
              </Button>
            )}
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        </div>
      ) : (
        <div className="task-list">
          {activeTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onStatusChange={handleGeneralStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
