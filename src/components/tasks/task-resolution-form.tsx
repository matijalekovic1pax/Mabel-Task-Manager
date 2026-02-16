import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { resolutionSchema } from '@/lib/validations/task'
import { resolveTask } from '@/lib/services/tasks'
import { createNotification } from '@/lib/services/notifications'
import { useAuth } from '@/contexts/auth-context'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TaskWithDetails } from '@/lib/types'

export function TaskResolutionForm({
  task,
  onResolved,
}: {
  task: TaskWithDetails
  onResolved: () => void
}) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return

    const formData = new FormData(e.currentTarget)
    const raw = {
      status: formData.get('status') as string,
      resolution_note: formData.get('resolution_note') as string,
    }

    const validated = resolutionSchema.safeParse(raw)
    if (!validated.success) {
      setError(validated.error.issues[0].message)
      return
    }

    setLoading(true)
    setError(null)

    try {
      await resolveTask(task.id, validated.data, profile.id)

      await createNotification({
        recipient_id: task.submitted_by,
        type: validated.data.status === 'needs_more_info' ? 'needs_more_info' : 'task_resolved',
        title: validated.data.status === 'needs_more_info' ? 'More information needed' : `Task ${validated.data.status}`,
        message: `${task.reference_number}: ${task.title}`,
        task_id: task.id,
      })

      toast.success('Task resolved')
      onResolved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />Resolve Task
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label>Decision</Label>
            <Select name="status" required>
              <SelectTrigger><SelectValue placeholder="Select decision" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approve</SelectItem>
                <SelectItem value="rejected">Reject</SelectItem>
                <SelectItem value="needs_more_info">Need More Info</SelectItem>
                <SelectItem value="deferred">Defer</SelectItem>
                <SelectItem value="resolved">Resolve</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="resolution_note">Note</Label>
            <Textarea id="resolution_note" name="resolution_note" placeholder="Explain your decision..." required rows={3} />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit Decision
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
