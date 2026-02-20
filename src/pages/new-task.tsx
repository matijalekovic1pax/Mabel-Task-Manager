import { TaskForm } from '@/components/tasks/task-form'

export function NewTaskPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Submit a New Task</h1>
      <TaskForm />
    </div>
  )
}
