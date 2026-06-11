import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  AppWindow,
  Copy,
  ExternalLink,
  Figma,
  FileText,
  FlaskConical,
  Globe2,
  Link2,
  Loader2,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import type { LinkVaultItemWithCreator, LinkVaultResourceType } from '@/lib/types'
import {
  canManageLinkVaultItem,
  createLinkVaultItem,
  deleteLinkVaultItem,
  getLinkVaultDomain,
  getLinkVaultItems,
  updateLinkVaultItem,
} from '@/lib/services/link-vault'
import { getErrorMessage, isSessionExpiredError } from '@/lib/supabase/errors'
import { withTimeout } from '@/lib/utils/async'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

type LinkFormState = {
  title: string
  url: string
  description: string
  resource_type: LinkVaultResourceType
  is_pinned: boolean
}

type TypeFilter = 'all' | LinkVaultResourceType

type ResourceMeta = {
  label: string
  icon: LucideIcon
  badgeClassName: string
}

const RESOURCE_TYPES: LinkVaultResourceType[] = [
  'deployment',
  'figma',
  'document',
  'prototype',
  'research',
  'other',
]

const RESOURCE_META: Record<LinkVaultResourceType, ResourceMeta> = {
  deployment: {
    label: 'Deployment',
    icon: AppWindow,
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  },
  figma: {
    label: 'Figma',
    icon: Figma,
    badgeClassName: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300',
  },
  document: {
    label: 'Document',
    icon: FileText,
    badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300',
  },
  prototype: {
    label: 'Prototype',
    icon: FlaskConical,
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
  },
  research: {
    label: 'Research',
    icon: FileText,
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
  },
  other: {
    label: 'Other',
    icon: Globe2,
    badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300',
  },
}

function emptyForm(): LinkFormState {
  return {
    title: '',
    url: '',
    description: '',
    resource_type: 'other',
    is_pinned: false,
  }
}

function sortLinks(items: LinkVaultItemWithCreator[]): LinkVaultItemWithCreator[] {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return Number(b.is_pinned) - Number(a.is_pinned)
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
}

function withProtocol(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function isValidUrl(url: string): boolean {
  if (!url.trim()) return false
  try {
    new URL(withProtocol(url))
    return true
  } catch {
    return false
  }
}

function inferResourceType(url: string): LinkVaultResourceType | null {
  const value = url.toLowerCase()

  if (value.includes('figma.com')) return 'figma'
  if (/(vercel\.app|railway\.app|render\.com|netlify\.app|pages\.dev|fly\.dev|herokuapp\.com)/.test(value)) {
    return 'deployment'
  }
  if (/(docs\.google\.com|notion\.so|notion\.site|sharepoint\.com|dropbox\.com|box\.com)/.test(value)) {
    return 'document'
  }
  if (/(miro\.com|framer\.app|webflow\.io|webflow\.com)/.test(value)) return 'prototype'
  if (/(github\.com|linear\.app|atlassian\.net|jira)/.test(value)) return 'research'

  return null
}

function formatUpdatedAt(value: string): string {
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

export function LinkVaultPage() {
  const { user, effectiveRole, signOut } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState<LinkVaultItemWithCreator[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<LinkFormState>(emptyForm)
  const [adding, setAdding] = useState(false)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [editingItem, setEditingItem] = useState<LinkVaultItemWithCreator | null>(null)
  const [editForm, setEditForm] = useState<LinkFormState>(emptyForm)
  const [savingEdit, setSavingEdit] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<LinkVaultItemWithCreator | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null)

  const handleRequestError = useCallback((err: unknown, fallback: string) => {
    if (isSessionExpiredError(err)) {
      void signOut().catch(() => {})
      navigate('/login?reason=session_expired', { replace: true })
      return
    }

    toast.error(getErrorMessage(err, fallback))
  }, [navigate, signOut])

  const refreshLinks = useCallback(async (options?: { background?: boolean }) => {
    if (!user) {
      setLoading(false)
      return
    }

    if (options?.background) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError(null)

    try {
      const data = await withTimeout(getLinkVaultItems())
      setItems(sortLinks(data))
    } catch (err) {
      if (isSessionExpiredError(err)) {
        handleRequestError(err, 'Session expired.')
        return
      }

      const message = getErrorMessage(err, 'Failed to load link vault.')
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [handleRequestError, user])

  useEffect(() => {
    void refreshLinks()
  }, [refreshLinks])

  const typeCounts = useMemo(() => {
    return items.reduce<Record<LinkVaultResourceType, number>>((counts, item) => {
      counts[item.resource_type] += 1
      return counts
    }, {
      deployment: 0,
      figma: 0,
      document: 0,
      prototype: 0,
      research: 0,
      other: 0,
    })
  }, [items])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      if (typeFilter !== 'all' && item.resource_type !== typeFilter) return false
      if (!query) return true

      return [
        item.title,
        item.url,
        item.description ?? '',
        item.creator?.full_name ?? '',
        getLinkVaultDomain(item.url),
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [items, search, typeFilter])

  async function handleAddLink(e: FormEvent) {
    e.preventDefault()

    if (!user) return
    if (!form.title.trim()) {
      toast.warning('Add a title for this link.')
      return
    }
    if (!isValidUrl(form.url)) {
      toast.warning('Add a valid link.')
      return
    }

    setAdding(true)

    try {
      const created = await createLinkVaultItem(user.id, form)
      setItems((prev) => sortLinks([created, ...prev]))
      setForm(emptyForm())
      toast.success('Link saved')
    } catch (err) {
      handleRequestError(err, 'Failed to save link.')
    } finally {
      setAdding(false)
    }
  }

  function openEditDialog(item: LinkVaultItemWithCreator) {
    setEditingItem(item)
    setEditForm({
      title: item.title,
      url: item.url,
      description: item.description ?? '',
      resource_type: item.resource_type,
      is_pinned: item.is_pinned,
    })
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()

    if (!editingItem) return
    if (!editForm.title.trim()) {
      toast.warning('Add a title for this link.')
      return
    }
    if (!isValidUrl(editForm.url)) {
      toast.warning('Add a valid link.')
      return
    }

    setSavingEdit(true)

    try {
      const updated = await updateLinkVaultItem(editingItem.id, editForm)
      setItems((prev) => sortLinks(prev.map((item) => item.id === updated.id ? updated : item)))
      setEditingItem(null)
      toast.success('Link updated')
    } catch (err) {
      handleRequestError(err, 'Failed to update link.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return

    setDeleting(true)

    try {
      await deleteLinkVaultItem(deleteTarget.id)
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success('Link deleted')
    } catch (err) {
      handleRequestError(err, 'Failed to delete link.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleTogglePinned(item: LinkVaultItemWithCreator) {
    if (togglingPinId === item.id) return

    const nextPinned = !item.is_pinned
    setTogglingPinId(item.id)
    setItems((prev) => sortLinks(prev.map((link) => (
      link.id === item.id ? { ...link, is_pinned: nextPinned } : link
    ))))

    try {
      const updated = await updateLinkVaultItem(item.id, { is_pinned: nextPinned })
      setItems((prev) => sortLinks(prev.map((link) => link.id === updated.id ? updated : link)))
    } catch (err) {
      setItems((prev) => sortLinks(prev.map((link) => (
        link.id === item.id ? { ...link, is_pinned: item.is_pinned } : link
      ))))
      handleRequestError(err, 'Failed to update pin.')
    } finally {
      setTogglingPinId(null)
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-muted-foreground/70" />
            <h1 className="text-2xl font-bold tracking-tight">Link Vault</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Shared review links for deployments, Figma work, documents, and prototypes.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => void refreshLinks({ background: true })} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <form onSubmit={handleAddLink} className="space-y-3 rounded-lg border bg-card p-3 shadow-xs sm:p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4 text-muted-foreground" />
          Save a link
        </div>

        <LinkVaultFormFields form={form} setForm={setForm} disabled={adding} idPrefix="new-link" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PinnedCheckbox
            checked={form.is_pinned}
            disabled={adding}
            onChange={(checked) => setForm((prev) => ({ ...prev, is_pinned: checked }))}
          />
          <Button type="submit" disabled={adding || !form.title.trim() || !form.url.trim()} className="sm:w-auto">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add link
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search links, domains, people..."
              className="pl-9"
            />
          </div>

          <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:pb-0">
            <TypeFilterButton
              active={typeFilter === 'all'}
              label="All"
              count={items.length}
              onClick={() => setTypeFilter('all')}
            />
            {RESOURCE_TYPES.map((type) => (
              <TypeFilterButton
                key={type}
                active={typeFilter === type}
                label={RESOURCE_META[type].label}
                count={typeCounts[type]}
                onClick={() => setTypeFilter(type)}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void refreshLinks()}>
              Retry
            </Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            hasLinks={items.length > 0}
            onClearFilters={() => {
              setSearch('')
              setTypeFilter('all')
            }}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredItems.map((item) => (
              <LinkVaultCard
                key={item.id}
                item={item}
                canManage={canManageLinkVaultItem(item, user?.id, effectiveRole ?? undefined)}
                togglingPin={togglingPinId === item.id}
                onCopy={() => void handleCopy(item.url)}
                onEdit={() => openEditDialog(item)}
                onDelete={() => setDeleteTarget(item)}
                onTogglePinned={() => void handleTogglePinned(item)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open && !savingEdit) setEditingItem(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit link</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <LinkVaultFormFields form={editForm} setForm={setEditForm} disabled={savingEdit} idPrefix="edit-link" />
            <PinnedCheckbox
              checked={editForm.is_pinned}
              disabled={savingEdit}
              onChange={(checked) => setEditForm((prev) => ({ ...prev, is_pinned: checked }))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingItem(null)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete link?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "<span className="font-medium text-foreground">{deleteTarget?.title}</span>" will be removed from the shared vault.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LinkVaultFormFields({
  form,
  setForm,
  disabled,
  idPrefix,
}: {
  form: LinkFormState
  setForm: Dispatch<SetStateAction<LinkFormState>>
  disabled: boolean
  idPrefix: string
}) {
  function handleUrlChange(value: string) {
    setForm((prev) => {
      const inferredType = inferResourceType(value)
      const shouldInferType = prev.resource_type === 'other' || !prev.url.trim()

      return {
        ...prev,
        url: value,
        resource_type: shouldInferType && inferredType ? inferredType : prev.resource_type,
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-title`}>Title</Label>
          <Input
            id={`${idPrefix}-title`}
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Chatbot staging"
            disabled={disabled}
            maxLength={160}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-url`}>URL</Label>
          <Input
            id={`${idPrefix}-url`}
            value={form.url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://..."
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <Select
            value={form.resource_type}
            onValueChange={(value) => setForm((prev) => ({ ...prev, resource_type: value as LinkVaultResourceType }))}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOURCE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {RESOURCE_META[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Notes</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="What should reviewers look at?"
          disabled={disabled}
          className="min-h-20 resize-y"
        />
      </div>
    </div>
  )
}

function PinnedCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex w-fit items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-foreground"
      />
      Pin to top
    </label>
  )
}

function TypeFilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <span>{label}</span>
      <span className={cn('tabular-nums', active ? 'text-background/70' : 'text-muted-foreground/70')}>{count}</span>
    </button>
  )
}

function LinkVaultCard({
  item,
  canManage,
  togglingPin,
  onCopy,
  onEdit,
  onDelete,
  onTogglePinned,
}: {
  item: LinkVaultItemWithCreator
  canManage: boolean
  togglingPin: boolean
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePinned: () => void
}) {
  const meta = RESOURCE_META[item.resource_type]
  const ResourceIcon = meta.icon
  const domain = getLinkVaultDomain(item.url)

  return (
    <article
      className={cn(
        'group flex min-h-36 flex-col gap-4 rounded-lg border bg-card p-4 shadow-xs transition-colors hover:bg-accent/20',
        item.is_pinned && 'border-amber-200 bg-amber-50/50 dark:border-amber-900/70 dark:bg-amber-950/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {item.is_pinned && (
              <span title="Pinned" className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Pin className="h-3.5 w-3.5 fill-current" />
              </span>
            )}
            <Badge variant="outline" className={cn('gap-1 border', meta.badgeClassName)}>
              <ResourceIcon className="h-3 w-3" />
              {meta.label}
            </Badge>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{domain}</span>
          </div>

          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-base font-semibold tracking-tight text-foreground underline-offset-4 hover:underline"
            title={item.title}
          >
            {item.title}
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" asChild title="Open link">
            <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open ${item.title}`}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onCopy} title="Copy link" aria-label={`Copy ${item.title}`}>
            <Copy className="h-4 w-4" />
          </Button>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onTogglePinned}
                disabled={togglingPin}
                title={item.is_pinned ? 'Unpin link' : 'Pin link'}
                aria-label={item.is_pinned ? `Unpin ${item.title}` : `Pin ${item.title}`}
              >
                {togglingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pin className={cn('h-4 w-4', item.is_pinned && 'fill-current')} />}
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit link" aria-label={`Edit ${item.title}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                title="Delete link"
                aria-label={`Delete ${item.title}`}
                className="text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {item.description && (
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Saved by {item.creator?.full_name ?? 'Unknown'}</span>
        <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/40 sm:block" />
        <span>Updated {formatUpdatedAt(item.updated_at)}</span>
      </div>
    </article>
  )
}

function EmptyState({ hasLinks, onClearFilters }: { hasLinks: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
        <Link2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {hasLinks ? 'No links match the current filters' : 'No shared links yet'}
      </p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        {hasLinks
          ? 'Adjust the search or type filter to bring more saved links back into view.'
          : 'Save deployment, Figma, document, and prototype links here so the team always knows where to review them.'}
      </p>
      {hasLinks && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
