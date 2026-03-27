import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { TaskStatusBadge } from './task-status-badge'
import { TaskPriorityBadge } from './task-priority-badge'
import { TaskCategoryIcon } from './task-category-icon'
import { CATEGORY_CONFIG } from '@/lib/utils/constants'
import { formatRelativeTime, formatDeadline, isOverdue } from '@/lib/utils/format'
import type { TaskWithSubmitter } from '@/lib/types'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TaskCard({ task }: { task: TaskWithSubmitter }) {
  const overdue =
    isOverdue(task.deadline) &&
    !['approved', 'rejected', 'resolved'].includes(task.status)

  return (
    <Link to={`/tasks/${task.id}`}>
      <Card
        className={cn(
          'shadow-none border transition-all duration-150 hover:bg-accent/40 hover:border-foreground/20',
          overdue && 'border-destructive/30 bg-destructive/[0.02]',
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono-refined text-muted-foreground/60">
                  {task.reference_number}
                </span>
                <TaskPriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
              </div>
              <h3 className="font-medium truncate text-foreground">{task.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <TaskCategoryIcon category={task.category} className="h-3.5 w-3.5 opacity-60" />
                  {CATEGORY_CONFIG[task.category].label}
                </span>
                <span>by {task.submitter.full_name}</span>
                <span>{formatRelativeTime(task.submitted_at)}</span>
                {task.deadline && (
                  <span className={cn('flex items-center gap-1', overdue && 'text-destructive font-medium')}>
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
