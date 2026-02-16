import {
  formatDistanceToNow,
  format,
  isPast,
  isToday,
  isTomorrow,
  differenceInHours,
  parseISO,
} from 'date-fns'

// ---------------------------------------------------------------------------
// Relative time  (e.g. "3 hours ago", "in 2 days")
// ---------------------------------------------------------------------------

export function formatRelativeTime(dateString: string): string {
  const date = parseISO(dateString)
  return formatDistanceToNow(date, { addSuffix: true })
}

// ---------------------------------------------------------------------------
// Formatted date  (e.g. "Feb 13, 2026")
// ---------------------------------------------------------------------------

export function formatDate(dateString: string): string {
  const date = parseISO(dateString)
  return format(date, 'MMM d, yyyy')
}

// ---------------------------------------------------------------------------
// Formatted date + time  (e.g. "Feb 13, 2026 at 3:45 PM")
// ---------------------------------------------------------------------------

export function formatDateTime(dateString: string): string {
  const date = parseISO(dateString)
  return format(date, "MMM d, yyyy 'at' h:mm a")
}

// ---------------------------------------------------------------------------
// Deadline formatting with urgency context
// ---------------------------------------------------------------------------

export function formatDeadline(dateString: string): string {
  const date = parseISO(dateString)

  if (isToday(date)) {
    return 'Due today'
  }

  if (isPast(date)) {
    return `Overdue (${formatDistanceToNow(date, { addSuffix: true })})`
  }

  if (isTomorrow(date)) {
    return 'Due tomorrow'
  }

  const hoursLeft = differenceInHours(date, new Date())
  if (hoursLeft <= 72) {
    return `Due in ${Math.ceil(hoursLeft / 24)} days`
  }

  return `Due ${format(date, 'MMM d, yyyy')}`
}

// ---------------------------------------------------------------------------
// Overdue check
// ---------------------------------------------------------------------------

export function isOverdue(dateString: string | null): boolean {
  if (!dateString) return false
  return isPast(parseISO(dateString))
}

// ---------------------------------------------------------------------------
// Human-readable file sizes  (e.g. "1.5 MB")
// ---------------------------------------------------------------------------

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const units = ['Bytes', 'KB', 'MB', 'GB'] as const
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)

  return `${size % 1 === 0 ? size : size.toFixed(1)} ${units[i]}`
}

// ---------------------------------------------------------------------------
// Time-of-day greeting
// ---------------------------------------------------------------------------

export function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
