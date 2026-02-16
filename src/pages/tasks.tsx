import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getTasks } from '@/lib/services/tasks'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskFilters } from '@/components/tasks/task-filters'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PlusCircle } from 'lucide-react'
import { hasAdminAccess } from '@/lib/utils/roles'
import { supabase } from '@/lib/supabase/client'
import type { TaskWithSubmitter, TaskFilters as TF } from '@/lib/types'

const SORT_MAP: Record<string, { sortBy: TF['sortBy']; sortOrder: TF['sortOrder'] }> = {
  newest: { sortBy: 'submitted_at', sortOrder: 'desc' },
  oldest: { sortBy: 'submitted_at', sortOrder: 'asc' },
  deadline: { sortBy: 'deadline', sortOrder: 'asc' },
  priority: { sortBy: 'priority', sortOrder: 'asc' },
}

export function TasksPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [tasks, setTasks] = useState<TaskWithSubmitter[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!profile) return

    const status = searchParams.get('status') || undefined
    const category = searchParams.get('category') || undefined
    const priority = searchParams.get('priority') || undefined
    const search = searchParams.get('search') || undefined
    const sort = searchParams.get('sort') || 'newest'
    const { sortBy, sortOrder } = SORT_MAP[sort] ?? SORT_MAP.newest

    const filters: TF = {
      status,
      category,
      priority,
      search,
      sortBy,
      sortOrder,
    }

    // Admins see all tasks; team members only see their own
    if (!hasAdminAccess(profile.role)) {
      filters.submittedBy = profile.id
    }

    try {
      const data = await getTasks(filters)
      setTasks(data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [profile, searchParams])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  // Realtime refresh
  useEffect(() => {
    const channel = supabase
      .channel('tasks-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        {!hasAdminAccess(profile?.role) && (
          <Button asChild>
            <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
          </Button>
        )}
      </div>

      <TaskFilters />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground">No tasks found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
