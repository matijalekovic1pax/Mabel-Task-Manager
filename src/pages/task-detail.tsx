import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getTask, transitionTask, deleteTask, updateGeneralTaskStatus, addTaskAssignee, removeTaskAssignee } from '@/lib/services/tasks'
import { getActiveTeamMembers } from '@/lib/services/team'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TaskStatusBadge } from '@/components/tasks/task-status-badge'
import { TaskPriorityBadge } from '@/components/tasks/task-priority-badge'
import { TaskCategoryIcon } from '@/components/tasks/task-category-icon'
import { TaskResolutionForm } from '@/components/tasks/task-resolution-form'
import { TaskDelegationForm } from '@/components/tasks/task-delegation-form'
import { TaskComments } from '@/components/tasks/task-comments'
import { formatDateTime, formatDeadline, formatRelativeTime, isOverdue } from '@/lib/utils/format'
import { CATEGORY_CONFIG, STATUS_CONFIG } from '@/lib/utils/constants'
import { ArrowLeft, Calendar, User, Clock, AlertTriangle, ExternalLink, Loader2, History, Trash2, ChevronDown, Users, PlayCircle, CheckCircle2, XCircle, UserPlus } from 'lucide-react'
import { hasAdminAccess, isCeo, isSuperAdmin } from '@/lib/utils/roles'
import { toast } from 'sonner'
import type { TaskWithDetails, Profile, GeneralTaskStatus } from '@/lib/types'
import { TaskAssigneesPicker } from '@/components/tasks/task-assignees-picker'

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
  if (STATUS_CONFIG[task.status]?.isFinal) return 'No action required'

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
  const { profile, effectiveRole } = useAuth()
  const navigate = useNavigate()
  const [task, setTask] = useState<TaskWithDetails | null>(null)
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [markingReady, setMarkingReady] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showAssigneePicker, setShowAssigneePicker] = useState(false)
  const [pendingAssignees, setPendingAssignees] = useState<string[]>([])
  const [addingAssignee, setAddingAssignee] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actionRef = useRef<HTMLDivElement>(null)

  const isAdmin = hasAdminAccess(effectiveRole)
  const canWrite = isCeo(effectiveRole)
  const readOnly = isSuperAdmin(effectiveRole)

  const refresh = useCallback(async () => {
    if (!id) {
      setError('No task ID provided')
      setLoading(false)
      return
    }
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
    // Load team members for delegation (CEO) and general task assignee management
    if (!task) return
    if (!canWrite && task.task_type !== 'general') return
    getActiveTeamMembers()
      .then(setTeamMembers)
      .catch(() => {})
  }, [canWrite, task])

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

  function scrollToActions() {
    actionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleDelete() {
    if (!task) return
    setDeleting(true)

    try {
      await deleteTask(task.id)
      toast.success('Task deleted')
      navigate('/tasks', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete task')
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  async function handleGeneralStatusUpdate(status: GeneralTaskStatus) {
    if (!task) return
    setUpdatingStatus(true)
    try {
      await updateGeneralTaskStatus(task.id, status)
      toast.success(`Task moved to ${status.replace('_', ' ')}`)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleAddAssignees() {
    if (!task || !profile || pendingAssignees.length === 0) return
    setAddingAssignee(true)
    try {
      for (const id of pendingAssignees) {
        await addTaskAssignee(task.id, id, profile.id)
      }
      toast.success('Assignees added')
      setPendingAssignees([])
      setShowAssigneePicker(false)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add assignees')
    } finally {
      setAddingAssignee(false)
    }
  }

  async function handleRemoveAssignee(assigneeId: string) {
    if (!task) return
    try {
      await removeTaskAssignee(task.id, assigneeId)
      toast.success('Assignee removed')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove assignee')
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

  const isFinal = STATUS_CONFIG[task.status]?.isFinal ?? false
  const isGeneralTask = task.task_type === 'general'
  const isApprovalTask = task.task_type === 'approval'

  // Approval task permissions
  const canRunAdminActions = isApprovalTask && canWrite && !isFinal
  const canDelegate = canRunAdminActions && task.status !== 'delegated'
  const canMarkReady = isApprovalTask && !isAdmin && task.status === 'delegated' && task.assigned_to === profile?.id

  // General task permissions
  const isGeneralCreator = isGeneralTask && profile?.id === task.submitted_by
  const isGeneralAssignee = isGeneralTask && (task.assignees ?? []).some((a) => a.assignee_id === profile?.id)
  const canUpdateGeneralStatus = isGeneralTask && !isFinal && (isGeneralCreator || isGeneralAssignee || isAdmin)
  const canManageAssignees = isGeneralTask && (isGeneralCreator || isAdmin)

  const overdue = task.deadline ? isOverdue(task.deadline) && !isFinal : false
  const canDelete = isSuperAdmin(effectiveRole) || profile?.id === task.submitted_by

  const existingAssigneeIds = (task.assignees ?? []).map((a) => a.assignee_id)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild><Link to="/tasks"><ArrowLeft className="mr-2 h-4 w-4" />Back to Tasks</Link></Button>
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Task
          </Button>
        )}
      </div>

      {/* Mobile: quick-jump button for CEO actions */}
      {canRunAdminActions && (
        <Button
          variant="outline"
          onClick={scrollToActions}
          className="md:hidden w-full"
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          Take Action on This Task
        </Button>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              This will permanently delete <span className="font-medium">{task.reference_number}</span> and all its comments and history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <div className="flex items-center gap-2 rounded-md bg-amber-50 p-3 dark:bg-amber-950/20">
                <ExternalLink className="h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Attached Files</p>
                  <a
                    href={task.file_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm text-amber-700 underline hover:text-amber-900"
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

      {/* General task: assignees list */}
      {isGeneralTask && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Assignees
              <Badge variant="secondary">{(task.assignees ?? []).length}</Badge>
            </CardTitle>
            {canManageAssignees && !isFinal && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAssigneePicker((p) => !p)}
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {showAssigneePicker && canManageAssignees && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <TaskAssigneesPicker
                  members={teamMembers}
                  selectedIds={pendingAssignees}
                  onChange={setPendingAssignees}
                  excludeIds={existingAssigneeIds}
                  placeholder="Search team members to add..."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={addingAssignee || pendingAssignees.length === 0}
                    onClick={handleAddAssignees}
                  >
                    {addingAssignee && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Add Assignees
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAssigneePicker(false); setPendingAssignees([]) }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {(task.assignees ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No one assigned yet.</p>
            ) : (
              <div className="divide-y">
                {(task.assignees ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2.5">
                      {a.assignee.avatar_url ? (
                        <img src={a.assignee.avatar_url} alt={a.assignee.full_name} className="h-7 w-7 rounded-full" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">
                          {a.assignee.full_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">{a.assignee.full_name}</p>
                        {a.assignee.department && (
                          <p className="text-xs text-muted-foreground">{a.assignee.department}</p>
                        )}
                      </div>
                    </div>
                    {canManageAssignees && !isFinal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveAssignee(a.assignee_id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* General task: status actions */}
      {canUpdateGeneralStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {task.status !== 'in_progress' && (
                <Button
                  variant="outline"
                  className="border-orange-300 text-orange-700 hover:bg-orange-50"
                  disabled={updatingStatus}
                  onClick={() => handleGeneralStatusUpdate('in_progress')}
                >
                  {updatingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Mark In Progress
                </Button>
              )}
              {task.status !== 'done' && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={updatingStatus}
                  onClick={() => handleGeneralStatusUpdate('done')}
                >
                  {updatingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark Done
                </Button>
              )}
              {task.status !== 'cancelled' && isGeneralCreator && (
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  disabled={updatingStatus}
                  onClick={() => handleGeneralStatusUpdate('cancelled')}
                >
                  {updatingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Task
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div ref={actionRef}>
        {canRunAdminActions && <TaskResolutionForm task={task} onResolved={refresh} />}
        {canDelegate && teamMembers.filter((m) => m.id !== profile?.id).length > 0 && (
          <TaskDelegationForm
            task={task}
            teamMembers={teamMembers.filter((m) => m.id !== profile?.id)}
            onDelegated={refresh}
          />
        )}
      </div>

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
        readOnly={readOnly}
      />
    </div>
  )
}
