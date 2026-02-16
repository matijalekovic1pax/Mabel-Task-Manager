import { Link } from 'react-router-dom'
import type { ActivityItem, ActivityEvent, ActivityComment } from '@/lib/services/activity'
import { formatRelativeTime } from '@/lib/utils/format'
import { STATUS_CONFIG } from '@/lib/utils/constants'
import type { TaskStatus } from '@/lib/types'
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UserPlus,
  Clock,
  Info,
  RotateCcw,
  MessageSquare,
  ArrowUpCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  approve: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600' },
  reject: { label: 'Rejected', icon: XCircle, color: 'text-red-600' },
  request_info: { label: 'Requested more info', icon: AlertCircle, color: 'text-amber-600' },
  provide_info: { label: 'Provided info', icon: Info, color: 'text-blue-600' },
  delegate: { label: 'Delegated', icon: UserPlus, color: 'text-purple-600' },
  defer: { label: 'Deferred', icon: Clock, color: 'text-slate-500' },
  resolve: { label: 'Resolved', icon: CheckCircle2, color: 'text-teal-600' },
  mark_ready: { label: 'Marked ready for review', icon: ArrowUpCircle, color: 'text-indigo-600' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as TaskStatus]
  if (!config) return <span className="text-xs">{status}</span>
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
      {config.label}
    </Badge>
  )
}

function EventItem({ item }: { item: ActivityEvent }) {
  const config = ACTION_CONFIG[item.action] ?? { label: item.action, icon: RotateCcw, color: 'text-muted-foreground' }
  const Icon = config.icon

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className={`mt-0.5 shrink-0 ${config.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <span className="font-medium">{item.actor.full_name}</span>
          {' '}
          <span className="text-muted-foreground">{config.label.toLowerCase()}</span>
        </p>
        <Link
          to={`/tasks/${item.task_id}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <span className="font-mono text-xs text-muted-foreground">{item.task.reference_number}</span>
          <span className="truncate">{item.task.title}</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={item.from_status} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <StatusBadge status={item.to_status} />
        </div>
        {item.note && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{item.note}</p>
        )}
        <p className="text-xs text-muted-foreground">{formatRelativeTime(item.created_at)}</p>
      </div>
    </div>
  )
}

function CommentItem({ item }: { item: ActivityComment }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0 text-blue-500">
        <MessageSquare className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <span className="font-medium">{item.author.full_name}</span>
          {' '}
          <span className="text-muted-foreground">commented</span>
        </p>
        <Link
          to={`/tasks/${item.task_id}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <span className="font-mono text-xs text-muted-foreground">{item.task.reference_number}</span>
          <span className="truncate">{item.task.title}</span>
        </Link>
        <p className="whitespace-pre-wrap text-xs text-muted-foreground line-clamp-2">{item.content}</p>
        <p className="text-xs text-muted-foreground">{formatRelativeTime(item.created_at)}</p>
      </div>
    </div>
  )
}

export function ActivityFeedItem({ item }: { item: ActivityItem }) {
  if (item.type === 'comment') {
    return <CommentItem item={item} />
  }
  return <EventItem item={item} />
}
