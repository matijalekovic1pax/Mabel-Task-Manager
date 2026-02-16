import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { delegationSchema } from '@/lib/validations/task'
import { transitionTask } from '@/lib/services/tasks'
import type { Profile, TaskWithDetails } from '@/lib/types'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

export function TaskDelegationForm({
  task,
  teamMembers,
  onDelegated,
}: {
  task: TaskWithDetails
  teamMembers: Profile[]
  onDelegated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const raw = {
      assigned_to: formData.get('assigned_to') as string,
      delegation_note: formData.get('delegation_note') as string,
    }

    const validated = delegationSchema.safeParse(raw)
    if (!validated.success) {
      setError(validated.error.issues[0].message)
      return
    }

    setLoading(true)
    setError(null)

    try {
      await transitionTask(task.id, 'delegate', {
        assignedTo: validated.data.assigned_to,
        note: validated.data.delegation_note ?? null,
      })

      toast.success('Task delegated')
      onDelegated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delegate task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Delegate Task</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select name="assigned_to" required>
              <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}{m.department && ` (${m.department})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delegation_note">Instructions</Label>
            <Textarea id="delegation_note" name="delegation_note" placeholder="What do you need them to do?" required rows={3} />
          </div>
          <Button type="submit" disabled={loading} variant="secondary">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delegate
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
