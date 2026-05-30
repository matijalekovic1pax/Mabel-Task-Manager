import { useState, useEffect, useCallback, useRef, useMemo, type ElementType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getTasks,
  getMySubmittedTasks,
  getMyAssignedTasks,
  getMyAssignedGeneralTasks,
  getCompanyTasks,
  transitionGeneralTask,
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { getGreeting, formatDeadline, isOverdue } from '@/lib/utils/format'
import { CATEGORY_CONFIG, PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/utils/constants'
import {
  PlusCircle, AlertTriangle, CheckCircle2, Loader2,
  Circle, PlayCircle, X, Inbox, Pencil, Search, LayoutGrid, ChevronDown,
  SlidersHorizontal, Clock3, PauseCircle, ListChecks, TimerReset,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { createRequestGuard, withTimeout } from '@/lib/utils/async'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { TaskWithSubmitter, GeneralTaskAction } from '@/lib/types'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const FINAL_STATUSES = ['approved', 'rejected', 'resolved', 'done', 'cancelled']
const REFRESH_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 15000
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
const PRIORITY_LABEL: Record<string, string> = { urgent: 'P0', high: 'P1', normal: 'P2', low: 'P3' }

type ViewMode = 'assigned' | 'created' | 'all'
type SortMode = 'smart' | 'priority' | 'deadline' | 'newest' | 'oldest'
type StageId = 'attention' | 'queued' | 'active' | 'review' | 'waiting'

type StageConfig = {
  id: StageId
  label: string
  description: string
  icon: ElementType
  tone: string
  dot: string
}

const STAGES: StageConfig[] = [
  {
    id: 'attention',
    label: 'Attention',
    description: 'Blocked, overdue, or needs input',
    icon: AlertTriangle,
    tone: 'border-red-200/70 bg-red-50/50 text-red-700',
    dot: 'bg-red-500',
  },
  {
    id: 'queued',
    label: 'Queued',
    description: 'Ready for a next move',
    icon: Circle,
    tone: 'border-slate-200 bg-slate-50/70 text-slate-700',
    dot: 'bg-slate-400',
  },
  {
    id: 'active',
    label: 'Active',
    description: 'Work currently moving',
    icon: PlayCircle,
    tone: 'border-blue-200/80 bg-blue-50/50 text-blue-700',
    dot: 'bg-blue-500',
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Waiting for decision or closeout',
    icon: ListChecks,
    tone: 'border-emerald-200/80 bg-emerald-50/50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  {
    id: 'waiting',
    label: 'Waiting',
    description: 'Deferred or delegated follow-up',
    icon: PauseCircle,
    tone: 'border-purple-200/80 bg-purple-50/50 text-purple-700',
    dot: 'bg-purple-500',
  },
]

const STAGE_ORDER = STAGES.reduce<Record<StageId, number>>((acc, stage, index) => {
  acc[stage.id] = index
  return acc
}, {} as Record<StageId, number>)

// The list row only surfaces the single obvious forward action per status.
// Note-required actions (block, send_back, cancel) live in the detail view.
type PrimaryActionSpec = {
  action: GeneralTaskAction
  label: string
  /** Who may perform it: 'assignee' | 'reviewer'. */
  role: 'assignee' | 'reviewer'
  className: string
}

const PRIMARY_ROW_ACTION: Partial<Record<string, PrimaryActionSpec>> = {
  todo:        { action: 'start',         label: 'Start',           role: 'assignee', className: 'border-orange-300 text-orange-700 hover:bg-orange-50' },
  in_progress: { action: 'complete',      label: 'Mark Complete',   role: 'assignee', className: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
  blocked:     { action: 'resume',        label: 'Resume',          role: 'assignee', className: 'border-orange-300 text-orange-700 hover:bg-orange-50' },
  in_review:   { action: 'approve_close', label: 'Approve & Close', role: 'reviewer', className: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
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

function isFinalTask(task: TaskWithSubmitter): boolean {
  return FINAL_STATUSES.includes(task.status)
}

function isTaskOverdue(task: TaskWithSubmitter): boolean {
  return !!task.deadline && isOverdue(task.deadline) && !isFinalTask(task)
}

function getTaskStage(task: TaskWithSubmitter): StageId {
  if (task.status === 'blocked' || task.status === 'needs_more_info' || isTaskOverdue(task)) {
    return 'attention'
  }
  if (task.status === 'in_progress') return 'active'
  if (task.status === 'in_review') return 'review'
  if (task.status === 'deferred' || task.status === 'delegated') return 'waiting'
  return 'queued'
}

function getTaskRiskRank(task: TaskWithSubmitter): number {
  if (task.status === 'blocked') return 0
  if (isTaskOverdue(task)) return 1
  if (task.status === 'needs_more_info') return 2
  if (task.priority === 'urgent') return 3
  if (task.priority === 'high') return 4
  return 5
}

function getDeadlineRank(task: TaskWithSubmitter): number {
  return task.deadline ? new Date(task.deadline).getTime() : Number.POSITIVE_INFINITY
}

function compareTasks(a: TaskWithSubmitter, b: TaskWithSubmitter, sortMode: SortMode): number {
  if (sortMode === 'newest') {
    return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  }
  if (sortMode === 'oldest') {
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  }

  const aDeadline = getDeadlineRank(a)
  const bDeadline = getDeadlineRank(b)

  if (sortMode === 'deadline') {
    if (aDeadline !== bDeadline) return aDeadline - bDeadline
    return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
  }

  const aPriority = PRIORITY_ORDER[a.priority] ?? 99
  const bPriority = PRIORITY_ORDER[b.priority] ?? 99

  if (sortMode === 'priority') {
    if (aPriority !== bPriority) return aPriority - bPriority
    if (aDeadline !== bDeadline) return aDeadline - bDeadline
    return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  }

  const aStage = STAGE_ORDER[getTaskStage(a)]
  const bStage = STAGE_ORDER[getTaskStage(b)]
  if (aStage !== bStage) return aStage - bStage

  const aRisk = getTaskRiskRank(a)
  const bRisk = getTaskRiskRank(b)
  if (aRisk !== bRisk) return aRisk - bRisk
  if (aPriority !== bPriority) return aPriority - bPriority
  if (aDeadline !== bDeadline) return aDeadline - bDeadline
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
}

function getRiskBadge(task: TaskWithSubmitter): { label: string; className: string } | null {
  if (task.status === 'blocked') {
    return { label: 'Blocked', className: 'bg-rose-50 text-rose-700 ring-rose-200' }
  }
  if (isTaskOverdue(task)) {
    return { label: 'Overdue', className: 'bg-red-50 text-red-700 ring-red-200' }
  }
  if (task.status === 'needs_more_info') {
    return { label: 'Needs info', className: 'bg-amber-50 text-amber-700 ring-amber-200' }
  }
  if (task.priority === 'urgent') {
    return { label: 'Urgent', className: 'bg-orange-50 text-orange-700 ring-orange-200' }
  }
  return null
}

// ─────────────────────────────────────────────
// Unified task row
// ─────────────────────────────────────────────

function TaskRow({
  task,
  currentUserId,
  isAdmin,
  onTransition,
}: {
  task: TaskWithSubmitter
  currentUserId: string | undefined
  isAdmin: boolean
  onTransition: (id: string, action: GeneralTaskAction) => Promise<void>
}) {
  const [updating, setUpdating] = useState(false)
  const isGeneral = task.task_type === 'general'
  const overdue = isTaskOverdue(task)
  const isFinal = isFinalTask(task)
  const riskBadge = getRiskBadge(task)
  const stage = STAGES.find(s => s.id === getTaskStage(task)) ?? STAGES[1]
  const StageIcon = stage.icon

  const isCreator = isGeneral && !!currentUserId && task.submitted_by === currentUserId
  const isAssignee = isGeneral
    && !!currentUserId
    && (task.assignees ?? []).some((assignee) => assignee.assignee_id === currentUserId)
  const isAssigner = isGeneral
    && !!currentUserId
    && (task.assignees ?? []).some((assignee) => assignee.assigned_by === currentUserId)
  const canReview = (isCreator || isAssigner) && !isAssignee
  const primary = isGeneral ? PRIMARY_ROW_ACTION[task.status] : undefined
  const canShowPrimary = !!primary && (
    primary.role === 'reviewer'
      ? canReview
      : isAssignee || isAdmin
  )

  async function handleClick() {
    if (!primary) return
    setUpdating(true)
    try { await onTransition(task.id, primary.action) }
    finally { setUpdating(false) }
  }

  const inner = (
    <div className={cn(
      'group flex min-h-[136px] flex-col gap-3 px-3.5 py-3.5 transition-colors duration-150 md:min-h-[96px] md:flex-row md:items-stretch md:gap-4 md:px-4',
      PRIORITY_STRIPE[task.priority],
      overdue        && 'bg-red-50/45',
      task.priority === 'urgent' && !overdue && !isFinal && 'bg-orange-50/25',
      isFinal        && 'opacity-55',
      'hover:bg-accent/45 cursor-pointer',
    )}>
      <div className="flex items-start justify-between gap-3 md:w-52 md:shrink-0 md:flex-col md:justify-start">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md border', stage.tone)}>
            <StageIcon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn(
                'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                isGeneral
                  ? 'bg-sky-50 text-sky-700'
                  : 'bg-violet-50 text-violet-700',
              )}>
                {isGeneral ? 'Task' : 'Approval'}
              </span>
              <span className="font-mono-refined text-muted-foreground/45">
                {task.reference_number}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
              {stage.label}
            </p>
          </div>
        </div>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
          task.priority === 'urgent' && 'bg-red-100 text-red-700',
          task.priority === 'high' && 'bg-orange-100 text-orange-700',
          task.priority === 'normal' && 'bg-blue-100 text-blue-700',
          task.priority === 'low' && 'bg-slate-100 text-slate-600',
        )}>
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>

      <div className="min-w-0 flex-1 md:py-0.5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
          {riskBadge && (
            <span className={cn(
              'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset',
              riskBadge.className,
            )}>
              {riskBadge.label}
            </span>
          )}
        </div>

        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-foreground/80">
          {task.title}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <TaskCategoryIcon category={task.category} className="h-3 w-3 shrink-0 opacity-45" />
            <span className="truncate">{CATEGORY_CONFIG[task.category].label}</span>
          </span>
          <span className="truncate">by {task.submitter?.full_name ?? 'Unknown'}</span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/45 pt-2 md:mt-0 md:w-52 md:shrink-0 md:flex-col md:items-end md:border-l md:border-t-0 md:pl-4 md:pt-0">
        {task.deadline && (
          <span className={cn(
            'flex min-w-0 items-center gap-1 text-xs',
            overdue ? 'text-red-600 font-medium' : 'text-muted-foreground/55',
          )}>
            {overdue ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Clock3 className="h-3 w-3 shrink-0" />}
            {formatDeadline(task.deadline)}
          </span>
        )}
        {!task.deadline && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground/45">
            <TimerReset className="h-3 w-3" />No deadline
          </span>
        )}
        {isGeneral && primary && canShowPrimary && (
          <Button
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={e => { e.preventDefault(); e.stopPropagation(); void handleClick() }}
            className={cn('h-7 shrink-0 px-2 text-xs', primary.className)}
          >
            {updating && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  )

  return <Link to={`/tasks/${task.id}`} className="block">{inner}</Link>
}

// ─────────────────────────────────────────────
// Tasks Page
// ─────────────────────────────────────────────

export function TasksPage() {
  const navigate = useNavigate()
  const { profile, effectiveRole, signOut } = useAuth()
  const isSuperAdmin = effectiveRole === 'super_admin'

  const [submittedApproval, setSubmittedApproval] = useState<TaskWithSubmitter[]>([])
  const [assignedApproval, setAssignedApproval]   = useState<TaskWithSubmitter[]>([])
  const [assignedGeneral, setAssignedGeneral]     = useState<TaskWithSubmitter[]>([])
  const [createdGeneral, setCreatedGeneral]       = useState<TaskWithSubmitter[]>([])
  const [allTasks, setAllTasks]                   = useState<TaskWithSubmitter[]>([])
  const [loading, setLoading]                     = useState(true)
  const [refreshing, setRefreshing]               = useState(false)
  const [error, setError]                         = useState<string | null>(null)

  // Global view toggle
  const [view, setView] = useState<ViewMode>('assigned')

  // Filters — client-side
  const [search, setSearch]                 = useState('')
  const [filterStatus, setFilterStatus]     = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [sortMode, setSortMode]             = useState<SortMode>('smart')

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
      const [submitted, assigned, assignedGen, createdGen, all] = await withTimeout(Promise.all([
        getMySubmittedTasks(profile.id),
        getMyAssignedTasks(profile.id),
        getMyAssignedGeneralTasks(profile.id),
        getCompanyTasks({ submittedBy: profile.id }),
        isSuperAdmin ? getTasks() : Promise.resolve([] as TaskWithSubmitter[]),
      ]))

      if (!guardRef.current.isLatest(requestId)) return

      setSubmittedApproval(submitted)
      setAssignedApproval(assigned)
      setAssignedGeneral(assignedGen)
      setCreatedGeneral(createdGen)
      setAllTasks(all)
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
  }, [isSuperAdmin, navigate, profile, signOut])

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

  async function handleGeneralTransition(taskId: string, action: GeneralTaskAction) {
    try {
      await transitionGeneralTask(taskId, action)
      void refresh({ background: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update task')
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
  const allBase = useMemo(() => dedupe(allTasks), [allTasks])
  const baseTasks = view === 'assigned' ? assignedBase : view === 'created' ? createdBase : allBase

  // ── Stats (from pre-filter base) ──
  const stats = useMemo(() => ({
    open:       baseTasks.filter(t => !isFinalTask(t)).length,
    urgent:     baseTasks.filter(t => t.priority === 'urgent' && !isFinalTask(t)).length,
    atRisk:     baseTasks.filter(t => !isFinalTask(t) && (isTaskOverdue(t) || ['blocked', 'needs_more_info'].includes(t.status))).length,
    inProgress: baseTasks.filter(t => ['in_progress', 'in_review'].includes(t.status)).length,
    done:       baseTasks.filter(isFinalTask).length,
  }), [baseTasks])

  // ── Filtered + sorted tasks ──
  const activeTasks = useMemo(() => {
    let tasks = [...baseTasks]

    if (search.trim()) {
      const q = search.toLowerCase()
      tasks = tasks.filter(t => [
        t.title,
        t.description,
        t.reference_number,
        t.submitter?.full_name,
        CATEGORY_CONFIG[t.category].label,
        STATUS_CONFIG[t.status].label,
        PRIORITY_CONFIG[t.priority].label,
      ].filter(Boolean).join(' ').toLowerCase().includes(q))
    }
    if (filterStatus !== 'all')   tasks = tasks.filter(t => t.status === filterStatus)
    if (filterPriority !== 'all') tasks = tasks.filter(t => t.priority === filterPriority)
    if (filterCategory !== 'all') tasks = tasks.filter(t => t.category === filterCategory)

    tasks.sort((a, b) => compareTasks(a, b, sortMode))

    return tasks
  }, [baseTasks, search, filterStatus, filterPriority, filterCategory, sortMode])

  const hasFilters = search || filterStatus !== 'all' || filterPriority !== 'all' || filterCategory !== 'all'
  const hasControlTuning = hasFilters || sortMode !== 'smart'
  const controlCount = [
    !!search,
    filterStatus !== 'all',
    filterPriority !== 'all',
    filterCategory !== 'all',
    sortMode !== 'smart',
  ].filter(Boolean).length

  const openTasks     = activeTasks.filter(t => !isFinalTask(t))
  const finishedTasks = activeTasks.filter(isFinalTask)
  const stageGroups = STAGES.map(stage => ({
    ...stage,
    tasks: openTasks.filter(task => getTaskStage(task) === stage.id),
  }))
  const focusTask = openTasks.find(task => getTaskRiskRank(task) <= 3) ?? openTasks[0]
  const focusRiskBadge = focusTask ? getRiskBadge(focusTask) : null
  const visibleViewLabel = view === 'assigned' ? 'assigned to you' : view === 'created' ? 'created by you' : 'across the company'

  const [showFinished, setShowFinished] = useState(false)

  function clearFilters() {
    setSearch(''); setFilterStatus('all'); setFilterPriority('all'); setFilterCategory('all'); setSortMode('smart')
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
    <div className="mx-auto max-w-[1800px] space-y-5 animate-page-in">
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {getGreeting()}, {profile?.full_name?.split(' ')[0]}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
              Task dashboard
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              A stage-based view of work {visibleViewLabel}, ordered by urgency, priority, deadline, and latest movement.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshing && (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground/60 sm:flex">
                <Loader2 className="h-3 w-3 animate-spin" />Syncing
              </span>
            )}
            <Button
              asChild
              className="shrink-0 bg-foreground text-background hover:bg-foreground/90"
            >
              <Link to="/tasks/new">
                <PlusCircle className="mr-2 h-4 w-4" />New Task
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid border-t md:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/55">
              Next focus
            </p>
            {focusTask ? (
              <Link to={`/tasks/${focusTask.id}`} className="group mt-2 block">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TaskStatusBadge status={focusTask.status} />
                  <TaskPriorityBadge priority={focusTask.priority} />
                  {focusRiskBadge && (
                    <span className={cn(
                      'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset',
                      focusRiskBadge.className,
                    )}>
                      {focusRiskBadge.label}
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-base font-semibold leading-snug transition-colors group-hover:text-foreground/75">
                  {focusTask.title}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono-refined">{focusTask.reference_number}</span>
                  <span>{CATEGORY_CONFIG[focusTask.category].label}</span>
                  {focusTask.deadline && (
                    <span className={cn(isTaskOverdue(focusTask) && 'font-medium text-red-600')}>
                      {formatDeadline(focusTask.deadline)}
                    </span>
                  )}
                </p>
              </Link>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No open work in this view.
              </p>
            )}
          </div>
          <div className="border-t p-4 md:border-l md:border-t-0 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/55">
              Current load
            </p>
            <div className="mt-3 grid grid-cols-3 divide-x">
              {[
                { label: 'Open', value: stats.open, tone: 'text-foreground' },
                { label: 'Urgent', value: stats.urgent, tone: stats.urgent > 0 ? 'text-red-600' : 'text-foreground' },
                { label: 'At risk', value: stats.atRisk, tone: stats.atRisk > 0 ? 'text-amber-600' : 'text-foreground' },
              ].map(s => (
                <div key={s.label} className="px-3 first:pl-0 last:pr-0">
                  <p className={cn('text-2xl font-bold tracking-tight tabular-nums', s.tone)}>{s.value}</p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/55">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Retry</Button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Open work', value: stats.open, icon: Circle, tone: 'text-foreground' },
          { label: 'Attention', value: stats.atRisk, icon: AlertTriangle, tone: stats.atRisk > 0 ? 'text-red-600' : 'text-foreground' },
          { label: 'In motion', value: stats.inProgress, icon: PlayCircle, tone: 'text-blue-700' },
          { label: 'Completed', value: stats.done, icon: CheckCircle2, tone: 'text-emerald-700' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/55">{s.label}</p>
              <s.icon className={cn('h-4 w-4', s.tone)} />
            </div>
            <p className={cn('mt-2 text-3xl font-bold tracking-tight tabular-nums', s.tone)}>{s.value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-center md:justify-between">
          <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
            <div className="inline-flex min-w-max rounded-lg bg-muted p-1">
              {([
                { id: 'assigned', label: 'Assigned to Me', mobileLabel: 'Assigned', icon: Inbox, count: assignedBase.filter(t => !isFinalTask(t)).length },
                { id: 'created', label: 'Created by Me', mobileLabel: 'Created', icon: Pencil, count: createdBase.filter(t => !isFinalTask(t)).length },
                ...(isSuperAdmin
                  ? [{ id: 'all', label: 'All Tasks', mobileLabel: 'All', icon: LayoutGrid, count: allBase.filter(t => !isFinalTask(t)).length }]
                  : []),
              ] as { id: ViewMode; label: string; mobileLabel: string; icon: ElementType; count: number }[]).map(v => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-all duration-150',
                    view === v.id
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <v.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{v.label}</span>
                  <span className="sm:hidden">{v.mobileLabel}</span>
                  <span className={cn('text-xs tabular-nums', view === v.id ? 'text-muted-foreground' : 'opacity-45')}>
                    {v.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 md:w-72 md:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/45" />
              <Input
                placeholder="Search title, ref, status..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full pl-8 text-sm"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 gap-1.5 shrink-0',
                    hasControlTuning && 'border-foreground/40 text-foreground',
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Controls
                  {hasControlTuning && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">
                      {controlCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Dashboard controls</p>
                  {hasControlTuning && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={clearFilters}>
                      <X className="h-3 w-3 mr-1" />Reset
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All Priorities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ordering</label>
                  <Select value={sortMode} onValueChange={value => setSortMode(value as SortMode)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smart">Smart stage order</SelectItem>
                      <SelectItem value="priority">Priority first</SelectItem>
                      <SelectItem value="deadline">Deadline first</SelectItem>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>

            {hasControlTuning && (
              <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="divide-y">
          {stageGroups.map(stage => {
            const StageIcon = stage.icon
            return (
              <div key={stage.id} className="min-w-0 p-3 md:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border', stage.tone)}>
                      <StageIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', stage.dot)} />
                        <h2 className="truncate text-sm font-semibold md:text-base">{stage.label}</h2>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{stage.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md bg-muted/55 px-2.5 py-1.5 md:min-w-52">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
                      {stage.tasks.length} {stage.tasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground/55">
                      {stage.tasks.filter(t => ['urgent', 'high'].includes(t.priority)).length} high+
                    </span>
                  </div>
                </div>

                {stage.tasks.length === 0 ? (
                  <div className="mt-3 flex min-h-16 items-center justify-center rounded-lg border border-dashed px-3 py-5 text-center">
                    <Circle className="mr-2 h-4 w-4 text-muted-foreground/35" />
                    <p className="text-xs text-muted-foreground">No tasks in this stage.</p>
                  </div>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-lg border bg-background/45">
                    {stage.tasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        currentUserId={profile?.id}
                        isAdmin={isSuperAdmin}
                        onTransition={handleGeneralTransition}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground/60">
          {openTasks.length === 0
            ? 'No open tasks'
            : `${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}`}
          {hasFilters && ' · filtered'}
        </p>
        <p className="hidden items-center gap-1.5 text-xs text-muted-foreground/60 sm:flex">
          <TimerReset className="h-3 w-3" />
          Ordered by {sortMode === 'smart' ? 'stage, risk, priority, deadline' : sortMode}
        </p>
      </div>

      {openTasks.length === 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'No tasks match your filters.'
                : view === 'assigned'
                  ? 'No tasks assigned to you yet.'
                  : view === 'created'
                    ? "You haven't created any tasks yet."
                    : 'No tasks found in the database.'}
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
      )}

      {finishedTasks.length > 0 && (
        <section>
          <button
            onClick={() => setShowFinished(v => !v)}
            className="flex w-full items-center gap-2 px-1 py-1.5 text-xs font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ChevronDown className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              showFinished && 'rotate-180',
            )} />
            Finished tasks
            <span className="ml-0.5 tabular-nums">({finishedTasks.length})</span>
          </button>
          {showFinished && (
            <div className="mt-1 space-y-3">
              {finishedTasks.map(task => (
                <div key={task.id} className="overflow-hidden rounded-xl border bg-card">
                  <TaskRow
                    task={task}
                    currentUserId={profile?.id}
                    isAdmin={isSuperAdmin}
                    onTransition={handleGeneralTransition}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
