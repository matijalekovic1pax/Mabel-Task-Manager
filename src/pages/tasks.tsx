import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getTasks, getMyAssignedTasks, getMySubmittedTasks } from '@/lib/services/tasks'
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

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

function mergeAndSortTasks(
  submitted: TaskWithSubmitter[],
  assigned: TaskWithSubmitter[],
  sortBy: TF['sortBy'],
  sortOrder: TF['sortOrder'],
): TaskWithSubmitter[] {
  const merged = new Map<string, TaskWithSubmitter>()
  submitted.forEach((task) => merged.set(task.id, task))
  assigned.forEach((task) => merged.set(task.id, task))

  const list = Array.from(merged.values())

  list.sort((a, b) => {
    let cmp = 0

    if (sortBy === 'priority') {
      cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    } else if (sortBy === 'deadline') {
      const aValue = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER
      const bValue = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER
      cmp = aValue - bValue
    } else {
      const aValue = new Date(a[sortBy ?? 'submitted_at']).getTime()
      const bValue = new Date(b[sortBy ?? 'submitted_at']).getTime()
      cmp = aValue - bValue
    }

    return sortOrder === 'desc' ? -cmp : cmp
  })

  return list
}

export function TasksPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<TaskWithSubmitter[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!profile) return

    const status = searchParams.get('status') || undefined
    const category = searchParams.get('category') || undefined
    const priority = searchParams.get('priority') || undefined
    const search = searchParams.get('search') || undefined
    const sort = searchParams.get('sort') || 'newest'
    const view = searchParams.get('view') || 'all'
    const { sortBy, sortOrder } = SORT_MAP[sort] ?? SORT_MAP.newest

    const baseFilters: TF = {
      status,
      category,
      priority,
      search,
      sortBy,
      sortOrder,
    }

    try {
      if (hasAdminAccess(profile.role)) {
        const data = await getTasks(baseFilters)
        setTasks(data)
      } else if (view === 'submitted') {
        const submitted = await getMySubmittedTasks(profile.id, baseFilters)
        setTasks(submitted)
      } else if (view === 'assigned') {
        const assigned = await getMyAssignedTasks(profile.id, baseFilters)
        setTasks(assigned)
      } else {
        const [submitted, assigned] = await Promise.all([
          getMySubmittedTasks(profile.id, baseFilters),
          getMyAssignedTasks(profile.id, baseFilters),
        ])
        setTasks(mergeAndSortTasks(submitted, assigned, sortBy, sortOrder))
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [profile, searchParams])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  useEffect(() => {
    const channel = supabase
      .channel('tasks-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void refresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refresh])

  function updateView(view: 'all' | 'submitted' | 'assigned') {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (view === 'all') {
        next.delete('view')
      } else {
        next.set('view', view)
      }
      return next
    })
  }

  const currentView = searchParams.get('view') || 'all'

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

      {!hasAdminAccess(profile?.role) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={currentView === 'all' ? 'default' : 'outline'} size="sm" onClick={() => updateView('all')}>
            All
          </Button>
          <Button variant={currentView === 'submitted' ? 'default' : 'outline'} size="sm" onClick={() => updateView('submitted')}>
            Submitted by Me
          </Button>
          <Button variant={currentView === 'assigned' ? 'default' : 'outline'} size="sm" onClick={() => updateView('assigned')}>
            Assigned to Me
          </Button>
        </div>
      )}

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
