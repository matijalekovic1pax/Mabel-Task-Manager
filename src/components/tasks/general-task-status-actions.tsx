import { useState } from 'react'
import { Loader2, MoreHorizontal, PlayCircle, Send, CheckCircle2, XCircle, Ban, RotateCw, Undo2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { transitionGeneralTask } from '@/lib/services/tasks'
import { toast } from 'sonner'
import type { GeneralTaskAction, TaskStatus, TaskWithDetails } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Action catalog: label, icon, role gating, note requirement, and appearance.
// ---------------------------------------------------------------------------

type ActionMeta = {
  label: string
  icon: LucideIcon
  tone: 'primary' | 'neutral' | 'warning' | 'danger' | 'success'
  requiresNote: boolean
  notePrompt?: string
}

const ACTION_META: Record<GeneralTaskAction, ActionMeta> = {
  start:           { label: 'Start Task',         icon: PlayCircle,   tone: 'primary', requiresNote: false },
  send_for_review: { label: 'Send for Review',    icon: Send,         tone: 'primary', requiresNote: false },
  approve_close:   { label: 'Approve & Close',    icon: CheckCircle2, tone: 'success', requiresNote: false },
  resume:          { label: 'Resume',             icon: RotateCw,     tone: 'primary', requiresNote: false },
  send_back:       { label: 'Send Back',          icon: Undo2,        tone: 'warning', requiresNote: true,  notePrompt: 'What needs to change?' },
  block:           { label: 'Mark Blocked',       icon: Ban,          tone: 'warning', requiresNote: true,  notePrompt: 'What is blocking this task?' },
  cancel:          { label: 'Cancel Task',        icon: XCircle,      tone: 'danger',  requiresNote: true,  notePrompt: 'Why is this task being cancelled?' },
}

// Per-status visible actions, in order. First entry is the primary button.
const ACTIONS_BY_STATUS: Record<string, GeneralTaskAction[]> = {
  todo:        ['start', 'cancel'],
  in_progress: ['send_for_review', 'block', 'cancel'],
  blocked:     ['resume', 'cancel'],
  in_review:   ['approve_close', 'send_back', 'cancel'],
}

// Who is allowed to perform each action (admin always allowed).
const ASSIGNEE_ACTIONS = new Set<GeneralTaskAction>(['start', 'send_for_review', 'block', 'resume'])
const CREATOR_ACTIONS  = new Set<GeneralTaskAction>(['approve_close', 'send_back', 'cancel'])

// Short descriptor of what the current status means / who's expected to act.
const STATUS_DESCRIPTION: Record<string, string> = {
  todo:        'Waiting to be picked up by an assignee.',
  in_progress: 'Work is underway.',
  blocked:     'Stuck — needs attention to unblock.',
  in_review:   'Submitted to the creator for review.',
}

type Props = {
  task: TaskWithDetails
  isCreator: boolean
  isAssignee: boolean
  isAdmin: boolean
  onTransitioned: () => void | Promise<void>
}

export function GeneralTaskStatusActions({ task, isCreator, isAssignee, isAdmin, onTransitioned }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [noteAction, setNoteAction] = useState<GeneralTaskAction | null>(null)
  const [noteValue, setNoteValue] = useState('')

  const status = task.status as TaskStatus
  const isFinal = status === 'done' || status === 'cancelled'

  if (isFinal) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            This task is {status === 'done' ? 'closed' : 'cancelled'}. No further actions are available.
          </p>
        </CardContent>
      </Card>
    )
  }

  const allForStatus = ACTIONS_BY_STATUS[status] ?? []

  const canRun = (action: GeneralTaskAction) => {
    if (isAdmin) return true
    if (ASSIGNEE_ACTIONS.has(action)) return isAssignee
    if (CREATOR_ACTIONS.has(action))  return isCreator
    return false
  }

  const available = allForStatus.filter(canRun)
  const primary   = available[0] ?? null
  const secondary = available.slice(1)

  async function runAction(action: GeneralTaskAction, note?: string | null) {
    setSubmitting(true)
    try {
      await transitionGeneralTask(task.id, action, note ?? null)
      toast.success(`${ACTION_META[action].label} — done`)
      await onTransitioned()
      setNoteAction(null)
      setNoteValue('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update task')
    } finally {
      setSubmitting(false)
    }
  }

  function onActionClick(action: GeneralTaskAction) {
    if (ACTION_META[action].requiresNote) {
      setNoteAction(action)
      setNoteValue('')
      return
    }
    void runAction(action)
  }

  const description = STATUS_DESCRIPTION[status] ?? ''

  // Empty state: the user has access to the task but no available actions at this status.
  const noActions = available.length === 0
  const waitingMessage = (() => {
    if (!noActions) return null
    if (status === 'in_review' && isAssignee && !isCreator) {
      return 'Waiting for the creator to review your submission.'
    }
    if ((status === 'todo' || status === 'in_progress' || status === 'blocked') && isCreator && !isAssignee) {
      return 'Waiting on the assignee to move this forward.'
    }
    return 'No actions available at this stage.'
  })()

  return (
    <>
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</p>
              <p className="mt-0.5 text-sm text-foreground">{description}</p>
            </div>

            {noActions ? (
              <p className="text-sm text-muted-foreground sm:text-right">{waitingMessage}</p>
            ) : (
              <div className="flex items-center gap-2">
                {primary && (
                  <PrimaryActionButton
                    action={primary}
                    disabled={submitting}
                    onClick={() => onActionClick(primary)}
                  />
                )}
                {secondary.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={submitting} aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[12rem]">
                      {secondary.map((action, idx) => {
                        const meta = ACTION_META[action]
                        const Icon = meta.icon
                        const isDanger = meta.tone === 'danger'
                        const showSeparator = isDanger && idx > 0
                        return (
                          <div key={action}>
                            {showSeparator && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                              onSelect={() => onActionClick(action)}
                              className={isDanger ? 'text-destructive focus:text-destructive' : ''}
                            >
                              <Icon className="h-4 w-4" />
                              <span>{meta.label}</span>
                            </DropdownMenuItem>
                          </div>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={noteAction !== null} onOpenChange={(open) => { if (!open) { setNoteAction(null); setNoteValue('') } }}>
        <DialogContent>
          {noteAction && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_META[noteAction].label}</DialogTitle>
                <DialogDescription>
                  {ACTION_META[noteAction].notePrompt ?? 'Leave a short note.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="transition-note">Note</Label>
                <Textarea
                  id="transition-note"
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  placeholder="Required — will be recorded on the task history."
                  rows={4}
                  autoFocus
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setNoteAction(null); setNoteValue('') }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  variant={ACTION_META[noteAction].tone === 'danger' ? 'destructive' : 'default'}
                  disabled={submitting || noteValue.trim().length === 0}
                  onClick={() => runAction(noteAction, noteValue.trim())}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PrimaryActionButton({
  action,
  disabled,
  onClick,
}: {
  action: GeneralTaskAction
  disabled: boolean
  onClick: () => void
}) {
  const meta = ACTION_META[action]
  const Icon = meta.icon

  const base = 'gap-1.5'
  const toneClass =
    meta.tone === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
    : meta.tone === 'danger' ? 'bg-destructive text-white hover:bg-destructive/90'
    : meta.tone === 'warning' ? 'bg-amber-500 hover:bg-amber-600 text-white'
    : ''

  return (
    <Button
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${toneClass}`.trim()}
    >
      {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {meta.label}
    </Button>
  )
}
