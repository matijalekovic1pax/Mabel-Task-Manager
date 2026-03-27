import { Badge } from '@/components/ui/badge'
import { STATUS_CONFIG } from '@/lib/utils/constants'
import type { TaskStatus } from '@/lib/types'

const statusStyles: Record<TaskStatus, string> = {
  // Approval workflow
  pending:         'bg-amber-50 text-amber-700 border-amber-200',
  in_review:       'bg-blue-50 text-blue-700 border-blue-200',
  approved:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:        'bg-red-50 text-red-600 border-red-200',
  needs_more_info: 'bg-orange-50 text-orange-700 border-orange-200',
  deferred:        'bg-slate-100 text-slate-500 border-slate-200',
  delegated:       'bg-violet-50 text-violet-700 border-violet-200',
  resolved:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  // General task workflow
  todo:            'bg-slate-100 text-slate-500 border-slate-200',
  in_progress:     'bg-blue-50 text-blue-700 border-blue-200',
  done:            'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:       'bg-slate-100 text-slate-400 border-slate-200',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={`font-medium text-[11px] px-1.5 py-0 ${statusStyles[status]}`}>
      {config.label}
    </Badge>
  )
}
