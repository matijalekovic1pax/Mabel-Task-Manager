import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import type { PersonalTodoWithItems, PersonalTodoItem, PersonalTodoLink } from '@/lib/types'
import {
  getPersonalTodo,
  updatePersonalTodo,
  deletePersonalTodo,
  createTodoItem,
  updateTodoItem,
  deleteTodoItem,
  createTodoLink,
  deleteTodoLink,
} from '@/lib/services/personal-todos'
import { formatDate } from '@/lib/utils/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft, Trash2, Loader2, Plus, Square, CheckSquare2,
  X, CalendarDays, Save, ExternalLink, Link2,
} from 'lucide-react'
import {
  StatusIcon, PRIORITY_DOT, PRIORITY_LABEL, STATUS_LABEL,
  parseDateLocal, formatDueLabel, isDueOverdue,
} from '@/pages/my-todos'
import { isToday } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

type TodoStatus   = PersonalTodoWithItems['status']
type TodoPriority = PersonalTodoWithItems['priority']

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MyTodoDetailPage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { user }   = useAuth()

  const [todo, setTodo]       = useState<PersonalTodoWithItems | null>(null)
  const [items, setItems]     = useState<PersonalTodoItem[]>([])
  const [links, setLinks]     = useState<PersonalTodoLink[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Title / description — local editable state, saved on blur
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [titleDirty, setTitleDirty]   = useState(false)
  const [descDirty, setDescDirty]     = useState(false)
  const [saving, setSaving]           = useState(false)

  // Checklist add
  const [newItemText, setNewItemText] = useState('')
  const [addingItem, setAddingItem]   = useState(false)
  const newItemRef = useRef<HTMLInputElement>(null)

  // Links add
  const [newLinkUrl, setNewLinkUrl]     = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [addingLink, setAddingLink]     = useState(false)
  const newLinkRef = useRef<HTMLInputElement>(null)

  // Delete
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting]                 = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      try {
        const data = await getPersonalTodo(id!)
        if (cancelled) return
        if (!data) { setNotFound(true); return }
        setTodo(data)
        setItems(data.items)
        setLinks(data.links)
        setTitle(data.title)
        setDescription(data.description ?? '')
      } catch {
        if (!cancelled) toast.error('Failed to load todo')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id])

  // ── Computed ──────────────────────────────────────────────────────────────────

  const doneItems  = items.filter(i => i.is_done).length
  const totalItems = items.length
  const checklistProgress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0
  const overdue = todo?.due_date ? isDueOverdue(todo.due_date, todo.status) : false
  const dueSoon = todo?.due_date ? isToday(parseDateLocal(todo.due_date)) && todo.status !== 'done' : false

  // ── Field auto-save helpers ───────────────────────────────────────────────────

  async function saveField(updates: Parameters<typeof updatePersonalTodo>[1]) {
    if (!todo) return
    try {
      const updated = await updatePersonalTodo(todo.id, updates)
      setTodo(prev => prev ? { ...prev, ...updated } : prev)
    } catch {
      toast.error('Failed to save')
    }
  }

  async function handleTitleBlur() {
    const t = title.trim()
    if (!titleDirty || !t || t === todo?.title) { setTitleDirty(false); return }
    setSaving(true)
    await saveField({ title: t })
    setTitleDirty(false)
    setSaving(false)
  }

  async function handleDescBlur() {
    const d = description.trim()
    if (!descDirty || d === (todo?.description ?? '')) { setDescDirty(false); return }
    setSaving(true)
    await saveField({ description: d || null })
    setDescDirty(false)
    setSaving(false)
  }

  async function handleStatusChange(status: TodoStatus) {
    setTodo(prev => prev ? { ...prev, status } : prev)
    await saveField({ status })
  }

  async function handlePriorityChange(priority: TodoPriority) {
    setTodo(prev => prev ? { ...prev, priority } : prev)
    await saveField({ priority })
  }

  async function handleDueDateChange(due_date: string) {
    const val = due_date || null
    setTodo(prev => prev ? { ...prev, due_date: val } : prev)
    await saveField({ due_date: val })
  }

  // ── Checklist ─────────────────────────────────────────────────────────────────

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    const text = newItemText.trim()
    if (!text || !todo) return
    setAddingItem(true)
    try {
      const item = await createTodoItem(todo.id, text)
      setItems(prev => [...prev, item])
      setNewItemText('')
      newItemRef.current?.focus()
    } catch {
      toast.error('Failed to add item')
    } finally {
      setAddingItem(false)
    }
  }

  function handleNewItemKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setNewItemText(''); newItemRef.current?.blur() }
  }

  async function handleToggleItem(item: PersonalTodoItem) {
    const next = !item.is_done
    // Optimistic
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: next } : i))
    try {
      await updateTodoItem(item.id, { is_done: next })
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: item.is_done } : i))
      toast.error('Failed to update item')
    }
  }

  async function handleDeleteItem(itemId: string) {
    setItems(prev => prev.filter(i => i.id !== itemId))
    try {
      await deleteTodoItem(itemId)
    } catch {
      toast.error('Failed to delete item')
      // Reload to restore
      if (id) getPersonalTodo(id).then(d => d && setItems(d.items))
    }
  }

  // ── Links ─────────────────────────────────────────────────────────────────────

  async function handleAddLink(e: FormEvent) {
    e.preventDefault()
    const url = newLinkUrl.trim()
    if (!url || !todo) return
    // Prepend https:// if no protocol given
    const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`
    setAddingLink(true)
    try {
      const link = await createTodoLink(todo.id, fullUrl, newLinkLabel)
      setLinks(prev => [...prev, link])
      setNewLinkUrl('')
      setNewLinkLabel('')
      newLinkRef.current?.focus()
    } catch {
      toast.error('Failed to add link')
    } finally {
      setAddingLink(false)
    }
  }

  async function handleDeleteLink(linkId: string) {
    setLinks(prev => prev.filter(l => l.id !== linkId))
    try {
      await deleteTodoLink(linkId)
    } catch {
      toast.error('Failed to delete link')
      if (id) getPersonalTodo(id).then(d => d && setLinks(d.links))
    }
  }

  // ── Delete todo ───────────────────────────────────────────────────────────────

  async function handleDeleteTodo() {
    if (!todo) return
    setDeleting(true)
    try {
      await deletePersonalTodo(todo.id)
      navigate('/my-todos', { replace: true })
      toast.success('Todo deleted')
    } catch {
      toast.error('Failed to delete todo')
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />

  if (notFound || !todo) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-muted-foreground">Todo not found.</p>
        <Button variant="link" asChild className="mt-2"><Link to="/my-todos">Back to My Todos</Link></Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl pb-16">

      {/* ── Top bar ── */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link to="/my-todos">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            My Todos
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Save className="h-3 w-3 animate-pulse" /> Saving…
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="text-muted-foreground hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Title ── */}
      <input
        value={title}
        onChange={e => { setTitle(e.target.value); setTitleDirty(true) }}
        onBlur={handleTitleBlur}
        placeholder="Todo title"
        className="mb-6 w-full bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
      />

      {/* ── Metadata row ── */}
      <div className="mb-6 flex flex-wrap gap-3">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</span>
          <Select value={todo.status} onValueChange={v => handleStatusChange(v as TodoStatus)}>
            <SelectTrigger className="h-8 gap-2 border-0 bg-muted/60 px-3 text-xs font-medium hover:bg-muted">
              <StatusIcon status={todo.status} size={14} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Priority</span>
          <Select value={todo.priority} onValueChange={v => handlePriorityChange(v as TodoPriority)}>
            <SelectTrigger className="h-8 gap-2 border-0 bg-muted/60 px-3 text-xs font-medium hover:bg-muted">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[todo.priority])} />
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

        {/* Due date */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Due Date</span>
          <div className="relative flex h-8 items-center gap-2 rounded-md bg-muted/60 px-3 hover:bg-muted transition-colors">
            <CalendarDays className={cn('h-3.5 w-3.5 shrink-0', overdue ? 'text-red-500' : dueSoon ? 'text-amber-500' : 'text-muted-foreground')} />
            {todo.due_date ? (
              <span className={cn('text-xs font-medium', overdue ? 'text-red-500' : dueSoon ? 'text-amber-500' : 'text-foreground')}>
                {overdue ? 'Overdue · ' : ''}{formatDueLabel(todo.due_date)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No date</span>
            )}
            <input
              type="date"
              value={todo.due_date ?? ''}
              onChange={e => handleDueDateChange(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {todo.due_date && (
              <button
                onClick={e => { e.stopPropagation(); handleDueDateChange('') }}
                className="z-10 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* ── Description ── */}
      <div className="mb-6">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Description
        </label>
        <Textarea
          value={description}
          onChange={e => { setDescription(e.target.value); setDescDirty(true) }}
          onBlur={handleDescBlur}
          placeholder="Add a description, context, or notes for this todo…"
          rows={4}
          className="resize-none border-0 bg-muted/40 text-sm focus-visible:ring-1 focus-visible:ring-border"
        />
      </div>

      <Separator className="mb-6" />

      {/* ── Checklist ── */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Checklist
          </h2>
          {totalItems > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {doneItems} / {totalItems}
            </span>
          )}
        </div>

        {/* Checklist progress bar */}
        {totalItems > 0 && (
          <div className="mb-4 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${checklistProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{checklistProgress}% of steps complete</p>
          </div>
        )}

        {/* Items */}
        {items.length > 0 && (
          <div className="mb-3 space-y-0.5">
            {items.map(item => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={() => handleToggleItem(item)}
                onDelete={() => handleDeleteItem(item.id)}
              />
            ))}
          </div>
        )}

        {/* Add item form */}
        <form onSubmit={handleAddItem} className="flex gap-2">
          <div className="relative flex-1">
            <Plus className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={newItemRef}
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              onKeyDown={handleNewItemKeyDown}
              placeholder="Add a step…"
              className="pl-8 text-sm"
              disabled={addingItem}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={!newItemText.trim() || addingItem}>
            {addingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
          </Button>
        </form>

        {totalItems === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Break this todo into steps to track your progress.
          </p>
        )}
      </div>

      <Separator className="mb-6" />

      {/* ── Links ── */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Links
          </h2>
          {links.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{links.length}</span>
          )}
        </div>

        {/* Saved links */}
        {links.length > 0 && (
          <div className="mb-3 space-y-1">
            {links.map(link => (
              <LinkRow key={link.id} link={link} onDelete={() => handleDeleteLink(link.id)} />
            ))}
          </div>
        )}

        {/* Add link form */}
        <form onSubmit={handleAddLink} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={newLinkRef}
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setNewLinkUrl(''); setNewLinkLabel('') } }}
                placeholder="Paste a URL…"
                className="pl-8 text-sm"
                disabled={addingLink}
                type="url"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" disabled={!newLinkUrl.trim() || addingLink}>
              {addingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </Button>
          </div>
          {newLinkUrl.trim() && (
            <Input
              value={newLinkLabel}
              onChange={e => setNewLinkLabel(e.target.value)}
              placeholder="Label (optional) — e.g. Q2 Figma file"
              className="text-sm"
              disabled={addingLink}
            />
          )}
        </form>

        {links.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Paste URLs for docs, tickets, or files related to this todo.
          </p>
        )}
      </div>

      <Separator className="mb-6" />

      {/* ── Footer metadata ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Created {formatDate(todo.created_at)}</span>
        {todo.updated_at !== todo.created_at && (
          <span>Updated {formatDate(todo.updated_at)}</span>
        )}
      </div>

      {/* ── Delete dialog ── */}
      <Dialog open={showDeleteDialog} onOpenChange={open => { if (!open && !deleting) setShowDeleteDialog(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete todo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "<span className="font-medium text-foreground">{todo.title}</span>" and all its checklist items will be permanently deleted.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTodo} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Checklist row ────────────────────────────────────────────────────────────

function ChecklistRow({
  item,
  onToggle,
  onDelete,
}: {
  item: PersonalTodoItem
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
      <button
        onClick={onToggle}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        {item.is_done
          ? <CheckSquare2 className="h-4 w-4 text-emerald-500" />
          : <Square className="h-4 w-4" />
        }
      </button>
      <span className={cn('flex-1 text-sm', item.is_done && 'text-muted-foreground line-through')}>
        {item.text}
      </span>
      <button
        onClick={onDelete}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Link row ─────────────────────────────────────────────────────────────────

function LinkRow({ link, onDelete }: { link: PersonalTodoLink; onDelete: () => void }) {
  // Extract a readable display name from the URL when no label is set
  function getDisplayName() {
    if (link.label) return link.label
    try {
      const u = new URL(link.url)
      return u.hostname.replace(/^www\./, '')
    } catch {
      return link.url
    }
  }

  return (
    <div className="group flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/60">
      {/* Favicon */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=16`}
        alt=""
        className="h-4 w-4 shrink-0 rounded-sm"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />

      {/* Label + url */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{getDisplayName()}</p>
        {link.label && (
          <p className="truncate text-xs text-muted-foreground">{link.url}</p>
        )}
      </div>

      {/* Open */}
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        title="Open link"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
        title="Remove link"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-8" />
      </div>
      <Skeleton className="h-8 w-3/4" />
      <div className="flex gap-3">
        <Skeleton className="h-14 w-28" />
        <Skeleton className="h-14 w-28" />
        <Skeleton className="h-14 w-32" />
      </div>
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-px w-full" />
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    </div>
  )
}
