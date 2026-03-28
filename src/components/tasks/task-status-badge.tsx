import { Badge } from '@/components/ui/badge'
import { STATUS_CONFIG } from '@/lib/utils/constants'
import type { TaskStatus } from '@/lib/types'

const statusStyles: Record<TaskStatus, string> = {
  // Approval workflow
  pending:         'bg-stone-100 text-stone-600 border-stone-200',
  in_review:       'bg-orange-50 text-orange-700 border-orange-200',
  approved:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:        'bg-red-50 text-red-600 border-red-200',
  needs_more_info: 'bg-orange-50 text-orange-700 border-orange-200',
  deferred:        'bg-stone-100 text-stone-500 border-stone-200',
  delegated:       'bg-rose-50 text-rose-700 border-rose-200',
  resolved:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  // General task workflow
  todo:            'bg-stone-100 text-stone-500 border-stone-200',
  in_progress:     'bg-orange-50 text-orange-700 border-orange-200',
  done:            'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:       'bg-stone-100 text-stone-400 border-stone-200',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={`font-medium text-[11px] px-1.5 py-0 ${statusStyles[status]}`}>
      {config.label}
    </Badge>
  )
}
