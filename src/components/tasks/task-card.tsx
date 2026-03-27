import { Link } from 'react-router-dom'
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
    <Link
      to={`/tasks/${task.id}`}
      className={cn(
        'relative flex items-center gap-4 px-5 py-3.5 transition-colors duration-100',
        'hover:bg-accent/60 group',
        priorityStripe[task.priority],
        overdue && '!border-l-red-500',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-mono-refined text-muted-foreground/40">
            {task.reference_number}
          </span>
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
        </div>
        <p className="text-sm font-medium text-foreground leading-snug group-hover:text-foreground/80 transition-colors">
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <TaskCategoryIcon category={task.category} className="h-3 w-3 opacity-50" />
            {CATEGORY_CONFIG[task.category].label}
          </span>
          <span>by {task.submitter.full_name}</span>
          <span>{formatRelativeTime(task.submitted_at)}</span>
        </div>
      </div>

      {task.deadline && (
        <div className={cn(
          'shrink-0 flex items-center gap-1 text-xs',
          overdue ? 'text-red-600 font-medium' : 'text-muted-foreground/60',
        )}>
          {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {overdue ? 'Overdue' : formatDeadline(task.deadline)}
        </div>
      )}
    </Link>
  )
}
