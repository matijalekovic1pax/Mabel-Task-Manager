import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getTask, transitionTask } from '@/lib/services/tasks'
import { getActiveTeamMembers } from '@/lib/services/team'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { TaskStatusBadge } from '@/components/tasks/task-status-badge'
import { TaskPriorityBadge } from '@/components/tasks/task-priority-badge'
import { TaskCategoryIcon } from '@/components/tasks/task-category-icon'
import { TaskResolutionForm } from '@/components/tasks/task-resolution-form'
import { TaskDelegationForm } from '@/components/tasks/task-delegation-form'
import { TaskComments } from '@/components/tasks/task-comments'
import { formatDateTime, formatDeadline, formatRelativeTime, isOverdue } from '@/lib/utils/format'
import { CATEGORY_CONFIG, STATUS_CONFIG } from '@/lib/utils/constants'
import { ArrowLeft, Calendar, User, Clock, AlertTriangle, ExternalLink, Loader2, History } from 'lucide-react'
import { hasAdminAccess } from '@/lib/utils/roles'
import { toast } from 'sonner'
import type { TaskWithDetails, Profile } from '@/lib/types'

const ACTION_LABELS: Record<string, string> = {
  request_info: 'Requested More Info',
  delegate: 'Delegated',
  approve: 'Approved',
  reject: 'Rejected',
  defer: 'Deferred',
  resolve: 'Resolved',
  mark_ready: 'Marked Ready',
  provide_info: 'Provided Info',
}

function getNextActionOwner(task: TaskWithDetails): string {
  if (STATUS_CONFIG[task.status].isFinal) return 'No action required'

  if (task.status === 'needs_more_info') {
    return task.submitter.full_name
  }

  if (task.status === 'delegated' && task.assignee) {
    return task.assignee.full_name
  }

  return 'CEO'
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [task, setTask] = useState<TaskWithDetails | null>(null)
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [markingReady, setMarkingReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = hasAdminAccess(profile?.role)

  const refresh = useCallback(async () => {
    if (!id) return
    try {
      const data = await getTask(id)
      setTask(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!isAdmin) return

    getActiveTeamMembers()
      .then(setTeamMembers)
      .catch(() => {})
  }, [isAdmin])

  async function handleMarkReady() {
    if (!task) return
    setMarkingReady(true)

    try {
      await transitionTask(task.id, 'mark_ready', {
        note: 'Assignee marked task ready for CEO review.',
      })
      toast.success('Task moved to In Review')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark task ready')
    } finally {
      setMarkingReady(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" asChild><Link to="/tasks"><ArrowLeft className="mr-2 h-4 w-4" />Back to Tasks</Link></Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{error ?? 'Task not found.'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canRunAdminActions = isAdmin && !STATUS_CONFIG[task.status].isFinal
  const canDelegate = canRunAdminActions
  const canMarkReady = !isAdmin && task.status === 'delegated' && task.assigned_to === profile?.id
  const overdue = task.deadline ? isOverdue(task.deadline) && !STATUS_CONFIG[task.status].isFinal : false

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" asChild><Link to="/tasks"><ArrowLeft className="mr-2 h-4 w-4" />Back to Tasks</Link></Button>

      <Card>
        <CardHeader>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">{task.reference_number}</Badge>
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            {overdue && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />Overdue
              </Badge>
            )}
          </div>
          <CardTitle className="text-xl">{task.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>

          <Separator />

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <TaskCategoryIcon category={task.category} />
              <span>{CATEGORY_CONFIG[task.category].label}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Submitted by {task.submitter.full_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatDateTime(task.submitted_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Next action:</span>
              <span className="font-medium">{getNextActionOwner(task)}</span>
            </div>
            {task.deadline && (
              <div className={`flex items-center gap-2 ${overdue ? 'text-destructive' : ''}`}>
                <Calendar className="h-4 w-4" />
                <span>{formatDeadline(task.deadline)}</span>
              </div>
            )}
          </div>

          {task.file_link && (
            <>
              <Separator />
              <div className="flex items-center gap-2 rounded-md bg-blue-50 p-3 dark:bg-blue-950/20">
                <ExternalLink className="h-4 w-4 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Attached Files</p>
                  <a
                    href={task.file_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm text-blue-600 underline hover:text-blue-800"
                  >
                    {task.file_link}
                  </a>
                </div>
              </div>
            </>
          )}

          {task.assigned_to && task.assignee && (
            <>
              <Separator />
              <div className="rounded-md bg-purple-50 p-3 dark:bg-purple-950/20">
                <p className="text-sm font-medium">Delegated to {task.assignee.full_name}</p>
                {task.delegation_note && <p className="mt-1 text-sm text-muted-foreground">{task.delegation_note}</p>}
              </div>
            </>
          )}

          {task.resolution_note && (
            <>
              <Separator />
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm font-medium">Latest Decision Note</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{task.resolution_note}</p>
                {task.resolver && <p className="mt-1 text-xs text-muted-foreground">By {task.resolver.full_name}</p>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canMarkReady && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignee Action</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={handleMarkReady} disabled={markingReady}>
              {markingReady && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mark Ready for CEO Review
            </Button>
          </CardContent>
        </Card>
      )}

      {canRunAdminActions && <TaskResolutionForm task={task} onResolved={refresh} />}
      {canDelegate && (
        <TaskDelegationForm
          task={task}
          teamMembers={teamMembers.filter((m) => m.id !== profile?.id)}
          onDelegated={refresh}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />Transition History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {task.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transitions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {task.events.map((event) => (
                <div key={event.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{ACTION_LABELS[event.action] ?? event.action}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(event.created_at)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">By {event.actor?.full_name ?? 'Unknown user'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.from_status} {'->'} {event.to_status}
                  </p>
                  {event.note && <p className="mt-2 whitespace-pre-wrap text-sm">{event.note}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskComments
        taskId={task.id}
        taskSubmittedBy={task.submitted_by}
        taskStatus={task.status}
        comments={task.comments}
        onCommentAdded={refresh}
      />
    </div>
  )
}
