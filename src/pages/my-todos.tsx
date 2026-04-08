import { useState, useEffect, useRef, useMemo, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import type { PersonalTodo } from '@/lib/types'
import {
  getPersonalTodos,
  createPersonalTodo,
  updatePersonalTodo,
  deletePersonalTodo,
} from '@/lib/services/personal-todos'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format, isToday, isTomorrow, isPast } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Circle, CircleDot, CheckCircle2, Plus, Trash2,
  Loader2, CalendarDays, Flag, ClipboardList, ChevronRight,
} from 'lucide-react'

// ─── Types & constants ────────────────────────────────────────────────────────

type TodoStatus   = PersonalTodo['status']
type TodoPriority = PersonalTodo['priority']
type FilterTab    = 'all' | 'active' | 'done'
type SortKey      = 'priority' | 'due_date' | 'created_at'

const STATUS_NEXT: Record<TodoStatus, TodoStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
}

const PRIORITY_ORDER: Record<TodoPriority, number> = {
  urgent: 0, high: 1, normal: 2, low: 3,
}

export const PRIORITY_DOT: Record<TodoPriority, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-500',
  normal: 'bg-blue-400',
  low:    'bg-slate-300 dark:bg-slate-600',
}

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low',
}

export const STATUS_LABEL: Record<TodoStatus, string> = {
  todo: 'To Do', in_progress: 'In Progress', done: 'Done',
}

// ─── Date helpers (exported so detail page can reuse) ────────────────────────

/** Parse YYYY-MM-DD as local midnight — avoids UTC-offset date drift. */
export function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDueLabel(dateStr: string): string {
  const d = parseDateLocal(dateStr)
  if (isToday(d))    return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'MMM d')
}

export function isDueOverdue(dateStr: string, status: TodoStatus): boolean {
  if (status === 'done') return false
  const d = parseDateLocal(dateStr)
  return isPast(d) && !isToday(d)
}

// ─── Status icon (exported for reuse) ────────────────────────────────────────

export function StatusIcon({ status, size = 20 }: { status: TodoStatus; size?: number }) {
  if (status === 'done')
    return <CheckCircle2 style={{ width: size, height: size }} className="text-emerald-500 shrink-0" />
  if (status === 'in_progress')
    return <CircleDot style={{ width: size, height: size }} className="text-blue-500 shrink-0" />
  return <Circle style={{ width: size, height: size }} className="text-muted-foreground/40 shrink-0" />
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortTodos(todos: PersonalTodo[], by: SortKey): PersonalTodo[] {
  return [...todos].sort((a, b) => {
    if (by === 'priority') {
      const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (diff !== 0) return diff
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    }
    if (by === 'due_date') {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    }
    return b.created_at.localeCompare(a.created_at)
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MyTodosPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [todos, setTodos]     = useState<PersonalTodo[]>([])
  const [loading, setLoading] = useState(true)

  const [addTitle, setAddTitle]         = useState('')
  const [addPriority, setAddPriority]   = useState<TodoPriority>('normal')
  const [adding, setAdding]             = useState(false)
  const addInputRef                     = useRef<HTMLInputElement>(null)

  const [filter, setFilter] = useState<FilterTab>('all')
  const [sortBy, setSortBy] = useState<SortKey>('priority')

  const [togglingId, setTogglingId]     = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PersonalTodo | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  async function fetchTodos() {
    if (!user) return
    try {
      setTodos(await getPersonalTodos(user.id))
    } catch {
      toast.error('Failed to load todos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTodos() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeTodos = useMemo(() => sortTodos(todos.filter(t => t.status !== 'done'), sortBy), [todos, sortBy])
  const doneTodos   = useMemo(() => sortTodos(todos.filter(t => t.status === 'done'),   sortBy), [todos, sortBy])
  const doneCount   = doneTodos.length
  const totalCount  = todos.length
  const progress    = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  // ── Quick-add ─────────────────────────────────────────────────────────────────

  async function handleQuickAdd(e: FormEvent) {
    e.preventDefault()
    const title = addTitle.trim()
    if (!title || !user) return
    setAdding(true)
    try {
      const newTodo = await createPersonalTodo(user.id, { title, priority: addPriority })
      setTodos(prev => [newTodo, ...prev])
      setAddTitle('')
      setAddPriority('normal')
      addInputRef.current?.focus()
    } catch {
      toast.error('Failed to add todo')
    } finally {
      setAdding(false)
    }
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setAddTitle(''); addInputRef.current?.blur() }
  }

  // ── Status cycle (optimistic) ─────────────────────────────────────────────────

  async function handleStatusCycle(e: React.MouseEvent, todo: PersonalTodo) {
    e.stopPropagation()
    if (togglingId === todo.id) return
    const next = STATUS_NEXT[todo.status]
    setTogglingId(todo.id)
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: next } : t))
    try {
      await updatePersonalTodo(todo.id, { status: next })
    } catch {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: todo.status } : t))
      toast.error('Failed to update status')
    } finally {
      setTogglingId(null)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await deletePersonalTodo(deleteTarget.id)
      setTodos(prev => prev.filter(t => t.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success('Todo deleted')
    } catch {
      toast.error('Failed to delete todo')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Row ───────────────────────────────────────────────────────────────────────

  function renderTodo(todo: PersonalTodo) {
    const overdue = todo.due_date ? isDueOverdue(todo.due_date, todo.status) : false
    const dueSoon = todo.due_date ? isToday(parseDateLocal(todo.due_date)) && todo.status !== 'done' : false
    const isDone  = todo.status === 'done'

    return (
      <div
        key={todo.id}
        onClick={() => navigate(`/my-todos/${todo.id}`)}
        className={cn(
          'group flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
          isDone
            ? 'border-transparent bg-muted/30 opacity-60 hover:opacity-80'
            : 'border-border bg-card hover:bg-accent/40',
        )}
      >
        {/* Status toggle */}
        <button
          onClick={e => handleStatusCycle(e, todo)}
          disabled={togglingId === todo.id}
          title={`${STATUS_LABEL[todo.status]} — click to advance`}
          className="mt-0.5 shrink-0 rounded-full transition-transform hover:scale-110 disabled:opacity-50"
        >
          {togglingId === todo.id
            ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : <StatusIcon status={todo.status} />
          }
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[todo.priority])} title={PRIORITY_LABEL[todo.priority]} />
            <span className={cn('flex-1 text-sm leading-snug', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {todo.title}
            </span>
          </div>

          {todo.description && (
            <p className="mt-0.5 ml-4 truncate text-xs text-muted-foreground">{todo.description}</p>
          )}

          {todo.due_date && (
            <div className="mt-1 ml-4 flex items-center gap-1">
              <CalendarDays className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={cn('text-xs font-medium', overdue ? 'text-red-500' : dueSoon ? 'text-amber-500' : 'text-muted-foreground')}>
                {overdue ? 'Overdue · ' : ''}{formatDueLabel(todo.due_date)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={e => { e.stopPropagation(); setDeleteTarget(todo) }}
            title="Delete"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-5">

      {/* Header + progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">My Todos</h1>
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground">{doneCount} / {totalCount} done</span>
          )}
        </div>
        {totalCount > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{progress}% complete</p>
          </div>
        )}
      </div>

      {/* Quick-add */}
      <form onSubmit={handleQuickAdd} className="flex gap-2">
        <div className="relative flex-1">
          <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={addInputRef}
            value={addTitle}
            onChange={e => setAddTitle(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="What needs to be done?"
            className="pl-9"
            disabled={adding}
          />
        </div>
        <Select value={addPriority} onValueChange={v => setAddPriority(v as TodoPriority)} disabled={adding}>
          <SelectTrigger className="w-[140px] shrink-0">
            <Flag className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!addTitle.trim() || adding} className="shrink-0">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
        </Button>
      </form>

      {/* Filter + sort */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex rounded-lg border bg-muted/40 p-0.5 text-sm">
            {(['all', 'active', 'done'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'rounded-md px-3 py-1 font-medium capitalize transition-colors',
                  filter === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab}
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {tab === 'all' ? totalCount : tab === 'active' ? activeTodos.length : doneCount}
                </span>
              </button>
            ))}
          </div>
          <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-[135px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">By priority</SelectItem>
              <SelectItem value="due_date">By due date</SelectItem>
              <SelectItem value="created_at">By date added</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {(filter === 'all' || filter === 'active') && (
            <>
              {activeTodos.length === 0 && filter === 'active' && (
                <EmptyState title="Nothing active" description="All caught up — add a todo above to get started." />
              )}
              {activeTodos.map(renderTodo)}
            </>
          )}

          {filter === 'all' && activeTodos.length > 0 && doneTodos.length > 0 && (
            <div className="flex items-center gap-3 py-1">
              <Separator className="flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground">{doneCount} completed</span>
              <Separator className="flex-1" />
            </div>
          )}

          {(filter === 'all' || filter === 'done') && (
            <>
              {doneTodos.length === 0 && filter === 'done' && (
                <EmptyState title="Nothing done yet" description="Click the status circle on a todo to mark it done." />
              )}
              {doneTodos.map(renderTodo)}
            </>
          )}

          {totalCount === 0 && (
            <EmptyState
              title="Your personal todo list"
              description="Everything here is private — only you can see it. Add your first todo above."
              icon
            />
          )}
        </div>
      )}

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleteLoading) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete todo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "<span className="font-medium text-foreground">{deleteTarget?.title}</span>" will be permanently deleted.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ title, description, icon = false }: { title: string; description: string; icon?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
          <ClipboardList className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
