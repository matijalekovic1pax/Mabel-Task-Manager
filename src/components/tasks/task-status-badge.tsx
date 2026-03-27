import { Badge } from '@/components/ui/badge'
import { STATUS_CONFIG } from '@/lib/utils/constants'
import type { TaskStatus } from '@/lib/types'

const statusColors: Record<TaskStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  in_review: 'bg-foreground/5 text-foreground/70 border-foreground/15',
  approved: 'bg-foreground text-background border-foreground',
  rejected: 'bg-destructive/10 text-destructive border-destructive/25',
  needs_more_info: 'bg-amber-50 text-amber-700 border-amber-200',
  deferred: 'bg-transparent text-muted-foreground border-border',
  delegated: 'bg-foreground/8 text-foreground/75 border-foreground/15',
  resolved: 'bg-foreground text-background border-foreground',
  // General task statuses
  todo: 'bg-transparent text-muted-foreground border-border',
  in_progress: 'bg-foreground/8 text-foreground/75 border-foreground/15',
  done: 'bg-foreground text-background border-foreground',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/25',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={`font-medium ${statusColors[status]}`}>
      {config.label}
    </Badge>
  )
}
