import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { resolutionSchema } from '@/lib/validations/task'
import { transitionTask } from '@/lib/services/tasks'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TaskWithDetails } from '@/lib/types'

const ACTION_LABELS: Record<string, string> = {
  approve: 'Approve',
  reject: 'Reject',
  request_info: 'Request More Info',
  defer: 'Defer',
  resolve: 'Resolve',
}

export function TaskResolutionForm({
  task,
  onResolved,
}: {
  task: TaskWithDetails
  onResolved: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    const raw = {
      action: formData.get('action') as string,
      note: formData.get('note') as string,
    }

    const validated = resolutionSchema.safeParse(raw)
    if (!validated.success) {
      setError(validated.error.issues[0].message)
      return
    }

    setLoading(true)
    setError(null)

    try {
      await transitionTask(task.id, validated.data.action, { note: validated.data.note ?? null })
      toast.success(`Task ${ACTION_LABELS[validated.data.action].toLowerCase()}`)
      onResolved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit decision')
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
            <Select name="action" required>
              <SelectTrigger><SelectValue placeholder="Select decision" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
                <SelectItem value="request_info">Request More Info</SelectItem>
                <SelectItem value="defer">Defer</SelectItem>
                <SelectItem value="resolve">Resolve</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" name="note" placeholder="Explain your decision..." required rows={3} />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit Decision
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
