import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getTask } from '@/lib/services/tasks'
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
import { formatDateTime, formatDeadline, isOverdue } from '@/lib/utils/format'
import { CATEGORY_CONFIG, STATUS_CONFIG } from '@/lib/utils/constants'
import { ArrowLeft, Calendar, User, Clock, AlertTriangle } from 'lucide-react'
import { hasAdminAccess } from '@/lib/utils/roles'
import type { TaskWithDetails, Profile } from '@/lib/types'

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [task, setTask] = useState<TaskWithDetails | null>(null)
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isCeo = hasAdminAccess(profile?.role)

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

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    getActiveTeamMembers().then(setTeamMembers).catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" asChild><Link to="/tasks"><ArrowLeft className="mr-2 h-4 w-4" />Back to Tasks</Link></Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{error ?? 'Task not found.'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canResolve = isCeo && !STATUS_CONFIG[task.status].isFinal
  const canDelegate = isCeo && !STATUS_CONFIG[task.status].isFinal
  const overdue = task.deadline ? isOverdue(task.deadline) && !STATUS_CONFIG[task.status].isFinal : false

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" asChild><Link to="/tasks"><ArrowLeft className="mr-2 h-4 w-4" />Back to Tasks</Link></Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2 mb-2">
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
            {task.deadline && (
              <div className={`flex items-center gap-2 ${overdue ? 'text-destructive' : ''}`}>
                <Calendar className="h-4 w-4" />
                <span>{formatDeadline(task.deadline)}</span>
              </div>
            )}
          </div>

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
                <p className="text-sm font-medium">Resolution Note</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{task.resolution_note}</p>
                {task.resolver && <p className="mt-1 text-xs text-muted-foreground">By {task.resolver.full_name}</p>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* CEO action forms */}
      {canResolve && <TaskResolutionForm task={task} onResolved={refresh} />}
      {canDelegate && (
        <TaskDelegationForm
          task={task}
          teamMembers={teamMembers.filter((m) => m.id !== profile?.id)}
          onDelegated={refresh}
        />
      )}

      {/* Comments */}
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
