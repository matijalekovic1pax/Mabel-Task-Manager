import { Badge } from '@/components/ui/badge'
import { PRIORITY_CONFIG } from '@/lib/utils/constants'
import type { TaskPriority } from '@/lib/types'

const priorityStyles: Record<TaskPriority, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-300 font-semibold',
  high:   'bg-orange-50 text-orange-600 border-orange-200',
  normal: 'bg-transparent text-stone-400 border-transparent',
  low:    'bg-transparent text-stone-300 border-transparent',
}

const priorityDot: Record<TaskPriority, string | null> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-400',
  normal: null,
  low:    null,
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const config = PRIORITY_CONFIG[priority]
  const dot = priorityDot[priority]

  if (priority === 'low') return null

  return (
    <Badge variant="outline" className={`font-medium text-[11px] px-1.5 py-0 gap-1 ${priorityStyles[priority]}`}>
      {dot && <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />}
      {config.label}
    </Badge>
  )
}
