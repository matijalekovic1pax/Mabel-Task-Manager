import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { getTasks } from '@/lib/services/tasks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskCard } from '@/components/tasks/task-card'
import { getGreeting } from '@/lib/utils/format'
import { CATEGORY_CONFIG } from '@/lib/utils/constants'
import { PlusCircle, Clock, AlertTriangle, CheckCircle2, ListTodo } from 'lucide-react'
import type { TaskWithSubmitter } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'

const CATEGORY_COLORS: Record<string, string> = {
  financial: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  project: 'bg-blue-50 border-blue-200 text-blue-700',
  hr_operations: 'bg-purple-50 border-purple-200 text-purple-700',
  client_relations: 'bg-amber-50 border-amber-200 text-amber-700',
  pr_marketing: 'bg-pink-50 border-pink-200 text-pink-700',
  administrative: 'bg-slate-50 border-slate-200 text-slate-600',
}

export function DashboardPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'

  const [tasks, setTasks] = useState<TaskWithSubmitter[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!profile) return
    try {
      const filters = isCeo
        ? { sortBy: 'submitted_at' as const, sortOrder: 'desc' as const }
        : { submittedBy: profile.id, sortBy: 'submitted_at' as const, sortOrder: 'desc' as const }
      const data = await getTasks(filters)
      setTasks(data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [profile, isCeo])

  useEffect(() => { refresh() }, [refresh])

  // Realtime refresh
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refresh])

  const pending = tasks.filter((t) => t.status === 'pending')
  const urgent = tasks.filter((t) => t.priority === 'urgent' && t.status === 'pending')
  const resolved = tasks.filter((t) => ['approved', 'rejected', 'resolved'].includes(t.status))
  const dueToday = tasks.filter((t) => {
    if (!t.deadline) return false
    const d = new Date(t.deadline)
    const now = new Date()
    return d.toDateString() === now.toDateString() && !['approved', 'rejected', 'resolved'].includes(t.status)
  })

  // Category breakdown for CEO
  const categoryBreakdown = Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({
    key,
    label: config.label,
    count: pending.filter((t) => t.category === key).length,
  }))

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{profile?.full_name?.split(' ')[0]}</span>
          </h1>
          <p className="text-muted-foreground">
            {isCeo ? "Here's what needs your attention." : "Here's an overview of your tasks."}
          </p>
        </div>
        {!isCeo && (
          <Button asChild className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 shadow-md shadow-violet-200">
            <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
          </Button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-amber-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <div className="rounded-full bg-amber-50 p-2">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-600">{pending.length}</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Urgent</CardTitle>
            <div className="rounded-full bg-red-50 p-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-600">{urgent.length}</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Due Today</CardTitle>
            <div className="rounded-full bg-blue-50 p-2">
              <ListTodo className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-blue-600">{dueToday.length}</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
            <div className="rounded-full bg-emerald-50 p-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-emerald-600">{resolved.length}</p></CardContent>
        </Card>
      </div>

      {/* Category breakdown for CEO */}
      {isCeo && categoryBreakdown.some((c) => c.count > 0) && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Pending by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryBreakdown.filter((c) => c.count > 0).map((c) => (
                <div key={c.key} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${CATEGORY_COLORS[c.key] ?? ''}`}>
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-lg font-bold">{c.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          {isCeo ? (
            <span>
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Mabel's</span> Queue
            </span>
          ) : 'Recent Tasks'}
        </h2>
        {pending.length === 0 && !isCeo && tasks.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 rounded-full bg-violet-50 p-4">
                <PlusCircle className="h-8 w-8 text-violet-400" />
              </div>
              <p className="mb-4 text-muted-foreground">No tasks yet. Submit your first task!</p>
              <Button asChild className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 shadow-md shadow-violet-200">
                <Link to="/tasks/new"><PlusCircle className="mr-2 h-4 w-4" />New Task</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(isCeo ? pending : tasks).slice(0, 10).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
            {(isCeo ? pending.length : tasks.length) > 10 && (
              <Button variant="outline" asChild className="w-full">
                <Link to="/tasks">View all tasks</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
