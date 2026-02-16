import { Badge } from '@/components/ui/badge'
import { STATUS_CONFIG } from '@/lib/utils/constants'
import type { TaskStatus } from '@/lib/types'

const statusColors: Record<TaskStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  in_review: 'bg-blue-100 text-blue-700 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  needs_more_info: 'bg-orange-100 text-orange-700 border-orange-200',
  deferred: 'bg-slate-100 text-slate-600 border-slate-200',
  delegated: 'bg-violet-100 text-violet-700 border-violet-200',
  resolved: 'bg-teal-100 text-teal-700 border-teal-200',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={`font-medium ${statusColors[status]}`}>
      {config.label}
    </Badge>
  )
}
