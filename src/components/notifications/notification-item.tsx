import type { Notification } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils/format'
import {
  FileCheck2, MessageSquare, AlertCircle, UserPlus, Info, Clock, AlertTriangle,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
  task_submitted: FileCheck2,
  task_resolved: FileCheck2,
  needs_more_info: AlertCircle,
  info_provided: Info,
  task_delegated: UserPlus,
  task_updated: FileCheck2,
  comment_added: MessageSquare,
  deadline_approaching: Clock,
  task_overdue: AlertTriangle,
}

export function NotificationItem({
  notification,
  onClick,
}: {
  notification: Notification
  onClick: () => void
}) {
  const Icon = ICON_MAP[notification.type] ?? Info

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted ${
        !notification.is_read ? 'bg-muted/50' : ''
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${!notification.is_read ? 'font-medium' : ''}`}>{notification.title}</p>
        <p className="truncate text-xs text-muted-foreground">{notification.message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatRelativeTime(notification.created_at)}</p>
      </div>
      {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}
