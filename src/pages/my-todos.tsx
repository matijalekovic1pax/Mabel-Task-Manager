import { useState, useEffect, useRef, useMemo, type FormEvent, type KeyboardEvent } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Circle, CircleDot, CheckCircle2, Plus, Pencil, Trash2,
  Loader2, CalendarDays, Flag, ClipboardList,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

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

const PRIORITY_DOT: Record<TodoPriority, string> = {
  urgent:  'bg-red-500',
  high:    'bg-orange-500',
  normal:  'bg-blue-400',
  low:     'bg-slate-300 dark:bg-slate-600',
}

const PRIORITY_LABEL: Record<TodoPriority, string> = {
  urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low',
}

const STATUS_LABEL: Record<TodoStatus, string> = {
  todo: 'To Do', in_progress: 'In Progress', done: 'Done',
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string as local midnight (avoids UTC-offset drift). */
function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDueLabel(dateStr: string): string {
  const d = parseDateLocal(dateStr)
  if (isToday(d))    return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'MMM d')
}

function isDueOverdue(dateStr: string, status: TodoStatus): boolean {
  if (status === 'done') return false
  const d = parseDateLocal(dateStr)
  return isPast(d) && !isToday(d)
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
    // created_at: newest first
    return b.created_at.localeCompare(a.created_at)
  })
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 20 }: { status: TodoStatus; size?: number }) {
  if (status === 'done') {
    return <CheckCircle2 style={{ width: size, height: size }} className="text-emerald-500 shrink-0" />
  }
  if (status === 'in_progress') {
    return <CircleDot style={{ width: size, height: size }} className="text-blue-500 shrink-0" />
  }
  return <Circle style={{ width: size, height: size }} className="text-muted-foreground/50 shrink-0" />
}

// ─── Page component ───────────────────────────────────────────────────────────

export function MyTodosPage() {
  const { user } = useAuth()

  // Data
  const [todos, setTodos]     = useState<PersonalTodo[]>([])
  const [loading, setLoading] = useState(true)

  // Quick-add
  const [addTitle, setAddTitle]   = useState('')
  const [addPriority, setAddPriority] = useState<TodoPriority>('normal')
  const [adding, setAdding]       = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)

  // Filter + sort
  const [filter, setFilter] = useState<FilterTab>('all')
  const [sortBy, setSortBy] = useState<SortKey>('priority')

  // Edit sheet
  const [editTodo, setEditTodo]         = useState<PersonalTodo | null>(null)
  const [editTitle, setEditTitle]       = useState('')
  const [editNotes, setEditNotes]       = useState('')
  const [editStatus, setEditStatus]     = useState<TodoStatus>('todo')
  const [editPriority, setEditPriority] = useState<TodoPriority>('normal')
  const [editDueDate, setEditDueDate]   = useState('')
  const [editSaving, setEditSaving]     = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget]   = useState<PersonalTodo | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Optimistic status toggle in-flight
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  async function fetchTodos() {
    if (!user) return
    try {
      const data = await getPersonalTodos(user.id)
      setTodos(data)
    } catch {
      toast.error('Failed to load todos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTodos() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeTodos = useMemo(
    () => sortTodos(todos.filter(t => t.status !== 'done'), sortBy),
    [todos, sortBy],
  )
  const doneTodos = useMemo(
    () => sortTodos(todos.filter(t => t.status === 'done'), sortBy),
    [todos, sortBy],
  )
  const doneCount  = todos.filter(t => t.status === 'done').length
  const totalCount = todos.length
  const progress   = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

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
    if (e.key === 'Escape') {
      setAddTitle('')
      addInputRef.current?.blur()
    }
  }

  // ── Status cycle (optimistic) ─────────────────────────────────────────────────

  async function handleStatusCycle(todo: PersonalTodo) {
    if (togglingId === todo.id) return
    const nextStatus = STATUS_NEXT[todo.status]
    setTogglingId(todo.id)
    // Optimistic update
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: nextStatus } : t))
    try {
      await updatePersonalTodo(todo.id, { status: nextStatus })
    } catch {
      // Revert
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: todo.status } : t))
      toast.error('Failed to update status')
    } finally {
      setTogglingId(null)
    }
  }

  // ── Edit sheet ────────────────────────────────────────────────────────────────

  function openEdit(todo: PersonalTodo) {
    setEditTodo(todo)
    setEditTitle(todo.title)
    setEditNotes(todo.notes ?? '')
    setEditStatus(todo.status)
    setEditPriority(todo.priority)
    setEditDueDate(todo.due_date ?? '')
  }

  function closeEdit() {
    if (editSaving) return
    setEditTodo(null)
  }

  async function handleSaveEdit() {
    if (!editTodo) return
    const title = editTitle.trim()
    if (!title) return
    setEditSaving(true)
    try {
      const updated = await updatePersonalTodo(editTodo.id, {
        title,
        notes:    editNotes.trim() || null,
        status:   editStatus,
        priority: editPriority,
        due_date: editDueDate || null,
      })
      setTodos(prev => prev.map(t => t.id === updated.id ? updated : t))
      setEditTodo(null)
      toast.success('Todo updated')
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setEditSaving(false)
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
      if (editTodo?.id === deleteTarget.id) setEditTodo(null)
      toast.success('Todo deleted')
    } catch {
      toast.error('Failed to delete todo')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderTodoItem(todo: PersonalTodo) {
    const overdue = todo.due_date ? isDueOverdue(todo.due_date, todo.status) : false
    const dueSoon = todo.due_date ? isToday(parseDateLocal(todo.due_date)) && todo.status !== 'done' : false
    const isDone  = todo.status === 'done'

    return (
      <div
        key={todo.id}
        className={cn(
          'group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
          isDone
            ? 'border-transparent bg-muted/30 opacity-60'
            : 'border-border bg-card hover:border-border/80 hover:bg-accent/30',
        )}
      >
        {/* Status toggle */}
        <button
          onClick={() => handleStatusCycle(todo)}
          disabled={togglingId === todo.id}
          className="mt-0.5 shrink-0 rounded-full transition-transform hover:scale-110 disabled:opacity-50"
          title={`Status: ${STATUS_LABEL[todo.status]} — click to advance`}
        >
          {togglingId === todo.id
            ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : <StatusIcon status={todo.status} />
          }
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {/* Priority dot */}
            <span
              className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[todo.priority])}
              title={PRIORITY_LABEL[todo.priority]}
            />
            {/* Title */}
            <span
              className={cn(
                'flex-1 text-sm leading-snug',
                isDone ? 'text-muted-foreground line-through' : 'text-foreground',
              )}
            >
              {todo.title}
            </span>
          </div>

          {/* Notes preview */}
          {todo.notes && (
            <p className="mt-0.5 ml-4 truncate text-xs text-muted-foreground">
              {todo.notes}
            </p>
          )}

          {/* Due date */}
          {todo.due_date && (
            <div className="mt-1 ml-4 flex items-center gap-1">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span
                className={cn(
                  'text-xs font-medium',
                  overdue  ? 'text-red-500'   :
                  dueSoon  ? 'text-amber-500' :
                  'text-muted-foreground',
                )}
              >
                {overdue ? `Overdue · ` : ''}{formatDueLabel(todo.due_date)}
              </span>
            </div>
          )}
        </div>

        {/* Actions (visible on hover / always on touch) */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => openEdit(todo)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setDeleteTarget(todo)}
            className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-5">

      {/* ── Header + progress ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">My Todos</h1>
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {doneCount} / {totalCount} done
            </span>
          )}
        </div>

        {totalCount > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{progress}% complete</p>
          </div>
        )}
      </div>

      {/* ── Quick-add form ── */}
      <form onSubmit={handleQuickAdd} className="flex gap-2">
        <div className="relative flex-1">
          <Plus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
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
        {/* Priority for new todo */}
        <Select
          value={addPriority}
          onValueChange={v => setAddPriority(v as TodoPriority)}
          disabled={adding}
        >
          <SelectTrigger className="w-[110px] shrink-0">
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

      {/* ── Filter + sort controls ── */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3">
          {/* Filter tabs */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5 text-sm">
            {(['all', 'active', 'done'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'rounded-md px-3 py-1 font-medium capitalize transition-colors',
                  filter === tab
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab}
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {tab === 'all'    ? totalCount  :
                   tab === 'active' ? activeTodos.length :
                   doneCount}
                </span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
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

      {/* ── Todo list ── */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Active todos */}
          {(filter === 'all' || filter === 'active') && (
            <>
              {activeTodos.length === 0 && filter === 'active' && (
                <EmptyState
                  title="Nothing active"
                  description="All caught up! Add a todo above to get started."
                />
              )}
              {activeTodos.map(renderTodoItem)}
            </>
          )}

          {/* Separator between active and done in "All" view */}
          {filter === 'all' && activeTodos.length > 0 && doneTodos.length > 0 && (
            <div className="flex items-center gap-3 py-1">
              <Separator className="flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground">
                {doneCount} completed
              </span>
              <Separator className="flex-1" />
            </div>
          )}

          {/* Done todos */}
          {(filter === 'all' || filter === 'done') && (
            <>
              {doneTodos.length === 0 && filter === 'done' && (
                <EmptyState
                  title="Nothing done yet"
                  description="Mark a todo as done by clicking its status circle."
                />
              )}
              {doneTodos.map(renderTodoItem)}
            </>
          )}

          {/* Empty: no todos at all */}
          {totalCount === 0 && !loading && (
            <EmptyState
              title="Your personal todo list"
              description="Track things privately — only you can see these. Add your first todo above."
              icon
            />
          )}
        </div>
      )}

      {/* ── Edit sheet ── */}
      <Sheet open={!!editTodo} onOpenChange={open => { if (!open) closeEdit() }}>
        <SheetContent className="flex flex-col gap-0 p-0 w-full sm:max-w-md">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Edit Todo</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Todo title"
                autoFocus
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Optional notes…"
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Status + Priority row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={v => setEditStatus(v as TodoStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={editPriority} onValueChange={v => setEditPriority(v as TodoPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Due date */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-due">Due Date</Label>
              <Input
                id="edit-due"
                type="date"
                value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)}
              />
              {editDueDate && (
                <button
                  type="button"
                  onClick={() => setEditDueDate('')}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Clear date
                </button>
              )}
            </div>

            <Separator />

            {/* Danger zone */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Danger zone</p>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40"
                onClick={() => { setDeleteTarget(editTodo); setEditTodo(null) }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete this todo
              </Button>
            </div>
          </div>

          <SheetFooter className="border-t px-6 py-4 flex gap-2">
            <Button variant="outline" onClick={closeEdit} disabled={editSaving} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editTitle.trim() || editSaving}
              className="flex-1"
            >
              {editSaving
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                : 'Save Changes'
              }
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleteLoading) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete todo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "<span className="font-medium text-foreground">{deleteTarget?.title}</span>" will be permanently deleted.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  title,
  description,
  icon = false,
}: {
  title: string
  description: string
  icon?: boolean
}) {
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
