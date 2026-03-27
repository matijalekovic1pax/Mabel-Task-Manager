import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import {
  getMyAssignedGeneralTasks,
  updateGeneralTaskStatus,
  getCompanyTasks,
} from '@/lib/services/tasks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  { id: 'todo', label: 'To Do', icon: Circle, color: 'text-slate-500' },
  { id: 'in_progress', label: 'In Progress', icon: PlayCircle, color: 'text-blue-500' },
  { id: 'done', label: 'Done', icon: CheckCircle2, color: 'text-foreground/70' },
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
      'rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
      currentStatus === 'done' && 'opacity-60',
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

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {task.submitter?.full_name ?? 'Unknown'}
        </span>
        {task.deadline && (
          <span className={cn('flex items-center gap-1', overdue && 'text-destructive font-medium')}>
            {overdue && <AlertTriangle className="h-3 w-3" />}
            <Calendar className="h-3 w-3" />
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
                status === 'done' && 'border-foreground/30 text-foreground hover:bg-foreground/5',
                status === 'cancelled' && 'border-red-300 text-red-600 hover:bg-red-50',
                status === 'in_progress' && 'border-blue-300 text-blue-700 hover:bg-blue-50',
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 rounded-full bg-muted p-4">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground">
              {tab === 'assigned' ? 'No tasks assigned to you yet.' : 'You haven\'t created any general tasks yet.'}
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link to="/tasks/new">Create a task</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Kanban columns */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = activeTasks.filter((t) => t.status === col.id)
            return (
              <div key={col.id} className="space-y-3">
                <Card className="shadow-none">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <col.icon className={cn('h-4 w-4', col.color)} />
                      {col.label}
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {colTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
                {colTasks.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">No tasks</p>
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
