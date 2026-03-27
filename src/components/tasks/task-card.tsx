import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { TaskStatusBadge } from './task-status-badge'
import { TaskPriorityBadge } from './task-priority-badge'
import { TaskCategoryIcon } from './task-category-icon'
import { CATEGORY_CONFIG } from '@/lib/utils/constants'
import { formatRelativeTime, formatDeadline, isOverdue } from '@/lib/utils/format'
import type { TaskWithSubmitter, TaskPriority } from '@/lib/types'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const priorityStripe: Record<TaskPriority, string> = {
  urgent: 'border-l-[3px] border-l-red-500',
  high:   'border-l-[3px] border-l-orange-400',
  normal: 'border-l-[3px] border-l-transparent',
  low:    'border-l-[3px] border-l-transparent',
}

export function TaskCard({ task }: { task: TaskWithSubmitter }) {
  const overdue =
    isOverdue(task.deadline) &&
    !['approved', 'rejected', 'resolved'].includes(task.status)

  return (
    <Link to={`/tasks/${task.id}`} className="block group">
      <Card
        className={cn(
          'border border-border/60 transition-all duration-150 hover:-translate-y-px hover:shadow-md',
          'shadow-[0_1px_2px_rgba(0,0,10,0.04),0_2px_8px_rgba(0,0,10,0.06)]',
          priorityStripe[task.priority],
          overdue && '!border-l-red-500',
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className="font-mono-refined text-muted-foreground/50">
                  {task.reference_number}
                </span>
                <TaskPriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
              </div>
              <h3 className="font-semibold text-sm leading-snug text-foreground group-hover:text-foreground/80 transition-colors">
                {task.title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <TaskCategoryIcon category={task.category} className="h-3 w-3 opacity-60" />
                  {CATEGORY_CONFIG[task.category].label}
                </span>
                <span>by {task.submitter.full_name}</span>
                <span>{formatRelativeTime(task.submitted_at)}</span>
                {task.deadline && (
                  <span className={cn('flex items-center gap-1', overdue && 'text-red-600 font-medium')}>
                    {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {overdue ? 'Overdue' : `Due ${formatDeadline(task.deadline)}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
