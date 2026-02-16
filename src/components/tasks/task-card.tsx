import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { TaskStatusBadge } from './task-status-badge'
import { TaskPriorityBadge } from './task-priority-badge'
import { TaskCategoryIcon } from './task-category-icon'
import { CATEGORY_CONFIG } from '@/lib/utils/constants'
import { formatRelativeTime, formatDeadline, isOverdue } from '@/lib/utils/format'
import type { TaskWithSubmitter, TaskCategory } from '@/lib/types'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const categoryBorder: Record<TaskCategory, string> = {
  financial: 'border-l-emerald-400',
  project: 'border-l-blue-400',
  hr_operations: 'border-l-purple-400',
  client_relations: 'border-l-amber-400',
  pr_marketing: 'border-l-pink-400',
  administrative: 'border-l-slate-300',
}

export function TaskCard({ task }: { task: TaskWithSubmitter }) {
  const overdue =
    isOverdue(task.deadline) &&
    !['approved', 'rejected', 'resolved'].includes(task.status)

  return (
    <Link to={`/tasks/${task.id}`}>
      <Card
        className={cn(
          'border-l-4 shadow-sm transition-all hover:shadow-md hover:bg-muted/30',
          task.priority === 'urgent' && task.status === 'pending'
            ? 'border-l-red-500'
            : overdue
              ? 'border-l-red-500'
              : categoryBorder[task.category]
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-violet-600/70 font-mono font-medium">
                  {task.reference_number}
                </span>
                <TaskPriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
              </div>
              <h3 className="font-medium truncate">{task.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <TaskCategoryIcon category={task.category} className="h-3.5 w-3.5" />
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
