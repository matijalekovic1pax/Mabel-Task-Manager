import { Badge } from '@/components/ui/badge'
import { PRIORITY_CONFIG } from '@/lib/utils/constants'
import type { TaskPriority } from '@/lib/types'

const priorityColors: Record<TaskPriority, string> = {
  urgent: 'bg-foreground text-background border-foreground',
  high: 'bg-foreground/10 text-foreground/80 border-foreground/20',
  normal: 'bg-transparent text-muted-foreground border-border',
  low: 'bg-transparent text-muted-foreground/60 border-border',
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const config = PRIORITY_CONFIG[priority]
  return (
    <Badge variant="outline" className={`font-medium ${priorityColors[priority]}`}>
      {config.label}
    </Badge>
  )
}
