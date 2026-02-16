import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { isSuperAdmin } from '@/lib/utils/roles'
import { TaskForm } from '@/components/tasks/task-form'

export function NewTaskPage() {
  const { profile } = useAuth()

  if (isSuperAdmin(profile?.role)) {
    return <Navigate to="/tasks" replace />
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Submit a New Task</h1>
      <TaskForm />
    </div>
  )
}
