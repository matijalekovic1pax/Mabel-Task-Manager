import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORY_CONFIG, PRIORITY_CONFIG } from '@/lib/utils/constants'
import { taskSchema } from '@/lib/validations/task'
import { createTask } from '@/lib/services/tasks'
import { createNotification } from '@/lib/services/notifications'
import { useAuth } from '@/contexts/auth-context'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function TaskForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return

    const formData = new FormData(e.currentTarget)
    const raw = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      priority: formData.get('priority') as string,
      deadline: (formData.get('deadline') as string) || null,
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

      // Notify all admins (CEO + super_admin)
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['ceo', 'super_admin'])

      if (admins) {
        await Promise.all(
          admins
            .filter((a) => a.id !== profile.id)
            .map((a) =>
              createNotification({
                recipient_id: a.id,
                type: 'task_submitted',
                title: 'New task submitted',
                message: `New ${validated.data.category} task: ${validated.data.title}`,
                task_id: task.id,
              }),
            ),
        )
      }

      toast.success('Task submitted successfully')
      navigate('/tasks')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit task')
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Submit a New Task</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Brief summary of what you need" required minLength={3} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" placeholder="Provide details, context, and any relevant information..." required minLength={10} rows={5} />
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
                <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline (optional)</Label>
            <Input id="deadline" name="deadline" type="datetime-local" />
          </div>
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Task
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
