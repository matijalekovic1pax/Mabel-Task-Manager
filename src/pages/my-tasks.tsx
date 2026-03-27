import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getMyAssignedGeneralTasks,
  updateGeneralTaskStatus,
  getCompanyTasks,
} from '@/lib/services/tasks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskPriorityBadge } from '@/components/tasks/task-priority-badge'
import { formatDeadline, isOverdue } from '@/lib/utils/format'
import {
  PlusCircle,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Circle,
  PlayCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { TaskWithSubmitter, GeneralTaskStatus } from '@/lib/types'

const COLUMNS: { id: GeneralTaskStatus; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'todo', label: 'To Do', icon: Circle, color: 'text-muted-foreground' },
  { id: 'in_progress', label: 'In Progress', icon: PlayCircle, color: 'text-amber-500' },
  { id: 'done', label: 'Done', icon: CheckCircle2, color: 'text-emerald-600' },
  { id: 'cancelled', label: 'Cancelled', icon: XCircle, color: 'text-red-400' },
]

const STATUS_TRANSITIONS: Record<GeneralTaskStatus, GeneralTaskStatus[]> = {
  todo: ['in_progress', 'cancelled'],
  in_progress: ['done', 'todo', 'cancelled'],
  done: [],
  cancelled: [],
}

function TaskKanbanCard({
  task,
  onStatusChange,
  currentUserId,
}: {
  task: TaskWithSubmitter
  onStatusChange: (taskId: string, status: GeneralTaskStatus) => Promise<void>
  currentUserId: string
}) {
  const [updating, setUpdating] = useState(false)
  const overdue = task.deadline ? isOverdue(task.deadline) && !['done', 'cancelled'].includes(task.status) : false
  const currentStatus = task.status as GeneralTaskStatus
  const nextStatuses = STATUS_TRANSITIONS[currentStatus] ?? []

  const STATUS_QUICK_LABELS: Partial<Record<GeneralTaskStatus, string>> = {
    in_progress: 'Start',
    done: 'Mark Done',
    todo: 'Move to To Do',
    cancelled: 'Cancel',
  }

  async function handleTransition(status: GeneralTaskStatus) {
    setUpdating(true)
    try {
      await onStatusChange(task.id, status)
    } finally {
      setUpdating(false)
    }
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
                status === 'done' && 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                status === 'cancelled' && 'border-red-300 text-red-600 hover:bg-red-50',
                status === 'in_progress' && 'border-amber-300 text-amber-700 hover:bg-amber-50',
                status === 'todo' && 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {updating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {STATUS_QUICK_LABELS[status] ?? status}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export function MyTasksPage() {
  const { profile } = useAuth()
  const [assignedTasks, setAssignedTasks] = useState<TaskWithSubmitter[]>([])
  const [createdTasks, setCreatedTasks] = useState<TaskWithSubmitter[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'assigned' | 'created'>('assigned')

  const loadTasks = useCallback(async () => {
    if (!profile) return
    try {
      const [assigned, created] = await Promise.all([
        getMyAssignedGeneralTasks(profile.id),
        getCompanyTasks({ submittedBy: profile.id }),
      ])
      setAssignedTasks(assigned)
      setCreatedTasks(created)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  async function handleStatusChange(taskId: string, status: GeneralTaskStatus) {
    try {
      await updateGeneralTaskStatus(taskId, status)
      toast.success(`Task moved to ${status.replace('_', ' ')}`)
      await loadTasks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const activeTasks = tab === 'assigned' ? assignedTasks : createdTasks

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
          <p className="text-sm text-muted-foreground">General tasks assigned to you or created by you.</p>
        </div>
        <Button asChild className="hidden bg-foreground text-background hover:bg-foreground/90 md:inline-flex">
          <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
        <button
          onClick={() => setTab('assigned')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'assigned' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Assigned to Me
          <Badge variant="secondary" className="ml-2">{assignedTasks.length}</Badge>
        </button>
        <button
          onClick={() => setTab('created')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'created' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Created by Me
          <Badge variant="secondary" className="ml-2">{createdTasks.length}</Badge>
        </button>
      </div>

      {activeTasks.length === 0 ? (
        <div className="task-list">
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-muted-foreground">
              {tab === 'assigned' ? 'No tasks assigned to you yet.' : "You haven't created any general tasks yet."}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/tasks/new">Create a task</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = activeTasks.filter((t) => t.status === col.id)
            return (
              <div key={col.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1 py-1">
                  <col.icon className={cn('h-3.5 w-3.5', col.color)} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{col.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{colTasks.length}</Badge>
                </div>
                {colTasks.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground/50">Empty</p>
                ) : (
                  colTasks.map((task) => (
                    <TaskKanbanCard
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                      currentUserId={profile?.id ?? ''}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
