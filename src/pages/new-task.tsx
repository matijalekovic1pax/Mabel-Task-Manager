import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { createTask, createGeneralTask } from '@/lib/services/tasks'
import { getActiveTeamMembers } from '@/lib/services/team'
import { taskSchema, generalTaskSchema } from '@/lib/validations/task'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CATEGORY_CONFIG, PRIORITY_CONFIG } from '@/lib/utils/constants'
import { TaskAssigneesPicker } from '@/components/tasks/task-assignees-picker'
import { TaskFileDraftPicker, type TaskFileDraft } from '@/components/tasks/task-file-draft-picker'
import { uploadTaskFile } from '@/lib/services/attachments'
import { Loader2, ClipboardList, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/types'

type TaskType = 'approval' | 'general'

export function NewTaskPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [taskType, setTaskType] = useState<TaskType>('approval')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [fileDrafts, setFileDrafts] = useState<TaskFileDraft[]>([])

  async function uploadDrafts(taskId: string, userId: string) {
    for (const draft of fileDrafts) {
      try {
        await uploadTaskFile(taskId, userId, draft.file)
      } catch (err) {
        toast.error(err instanceof Error ? `File upload: ${err.message}` : `Failed to upload ${draft.fileName}`)
      }
    }
  }

  useEffect(() => {
    getActiveTeamMembers()
      .then(setTeamMembers)
      .catch(() => {})
  }, [])

  async function handleApprovalSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return

    const formData = new FormData(e.currentTarget)
    const raw = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      priority: formData.get('priority') as string,
      deadline: (formData.get('deadline') as string) || null,
      file_link: (formData.get('file_link') as string) || null,
    }

    const validated = taskSchema.safeParse(raw)
    if (!validated.success) {
      setError(validated.error.issues[0].message)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const task = await createTask(validated.data, profile.id)
      if (fileDrafts.length > 0) await uploadDrafts(task.id, profile.id)
      toast.success('Approval request submitted')
      navigate('/tasks')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit task')
    } finally {
      setLoading(false)
    }
  }

  async function handleGeneralSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return

    const formData = new FormData(e.currentTarget)
    const raw = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      priority: formData.get('priority') as string,
      deadline: (formData.get('deadline') as string) || null,
      assignee_ids: assigneeIds,
    }

    const validated = generalTaskSchema.safeParse(raw)
    if (!validated.success) {
      setError(validated.error.issues[0].message)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const task = await createGeneralTask(validated.data, profile.id)
      if (fileDrafts.length > 0) await uploadDrafts(task.id, profile.id)
      toast.success('Task created and assignees notified')
      navigate('/my-tasks')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Task</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit an approval request to the CEO, or create a task you can assign to anyone.
        </p>
      </div>

      {/* Task type toggle */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => { setTaskType('approval'); setError(null) }}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-150',
            taskType === 'approval'
              ? 'border-foreground bg-foreground/5'
              : 'border-border hover:border-foreground/30 hover:bg-accent',
          )}
        >
          <div className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            taskType === 'approval' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
          )}>
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-sm">Approval Request</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Submit to the CEO for review and approval
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setTaskType('general'); setError(null) }}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-150',
            taskType === 'general'
              ? 'border-foreground bg-foreground/5'
              : 'border-border hover:border-foreground/30 hover:bg-accent',
          )}
        >
          <div className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            taskType === 'general' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
          )}>
            <Users className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-sm">General Task</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Assign to anyone on the team
            </p>
          </div>
        </button>
      </div>

      {/* Approval form */}
      {taskType === 'approval' && (
        <Card>
          <CardHeader>
            <CardTitle>Approval Request</CardTitle>
            <CardDescription>This will go to the CEO's queue for review.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleApprovalSubmit} className="space-y-5">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ap-title">Title</Label>
                <Input id="ap-title" name="title" placeholder="Brief summary of what you need" required minLength={3} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-description">Description</Label>
                <Textarea id="ap-description" name="description" placeholder="Provide details, context, and any relevant information..." required minLength={10} rows={5} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select name="category" required>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue="normal">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-file_link">File Link (optional)</Label>
                <Input id="ap-file_link" name="file_link" type="url" placeholder="https://www.dropbox.com/..." />
                <p className="text-xs text-muted-foreground">Paste a Dropbox, Google Drive, or any file sharing link</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-deadline">Deadline (optional)</Label>
                <Input id="ap-deadline" name="deadline" type="datetime-local" />
              </div>
              <div className="space-y-2">
                <Label>Files (optional)</Label>
                <TaskFileDraftPicker drafts={fileDrafts} onChange={setFileDrafts} disabled={loading} />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-foreground text-background hover:bg-foreground/90 sm:w-auto">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit for Approval
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* General task form */}
      {taskType === 'general' && (
        <Card>
          <CardHeader>
            <CardTitle>General Task</CardTitle>
            <CardDescription>Assign this task to one or more team members.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGeneralSubmit} className="space-y-5">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="gt-title">Title</Label>
                <Input id="gt-title" name="title" placeholder="What needs to be done?" required minLength={3} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gt-description">Description</Label>
                <Textarea id="gt-description" name="description" placeholder="Describe the task in detail..." required minLength={10} rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Assign To</Label>
                <TaskAssigneesPicker
                  members={teamMembers}
                  selectedIds={assigneeIds}
                  onChange={setAssigneeIds}
                  excludeIds={profile ? [profile.id] : []}
                  placeholder="Select team members..."
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to create an unassigned task (you can assign later).
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue="normal">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gt-deadline">Deadline (optional)</Label>
                <Input id="gt-deadline" name="deadline" type="datetime-local" />
              </div>
              <div className="space-y-2">
                <Label>Files (optional)</Label>
                <TaskFileDraftPicker drafts={fileDrafts} onChange={setFileDrafts} disabled={loading} />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-foreground text-background hover:bg-foreground/90 sm:w-auto">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Task
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
