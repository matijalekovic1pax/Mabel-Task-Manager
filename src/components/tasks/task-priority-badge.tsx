import { Badge } from '@/components/ui/badge'
import { PRIORITY_CONFIG } from '@/lib/utils/constants'
import type { TaskPriority } from '@/lib/types'

const priorityColors: Record<TaskPriority, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-300',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const config = PRIORITY_CONFIG[priority]
  return (
    <Badge variant="outline" className={`font-medium ${priorityColors[priority]}`}>
      {config.label}
    </Badge>
  )
}
