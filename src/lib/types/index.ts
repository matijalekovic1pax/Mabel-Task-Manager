export type {
  Database,
  Json,
  Profile,
  Task,
  TaskComment,
  TaskAttachment,
  TaskEvent,
  Notification,
  AllowedEmail,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  TaskAction,
  NotificationType,
  ProfileInsert,
  TaskInsert,
  TaskCommentInsert,
  TaskAttachmentInsert,
  TaskEventInsert,
  NotificationInsert,
  AllowedEmailInsert,
  TaskWithSubmitter,
  TaskWithDetails,
} from './database'

// ---------------------------------------------------------------------------
// Generic action result wrapper (for service return values)
// ---------------------------------------------------------------------------

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ---------------------------------------------------------------------------
// Task filter options used by listing / search queries
// ---------------------------------------------------------------------------

export interface TaskFilters {
  status?: string | string[]
  category?: string | string[]
  priority?: string | string[]
  submittedBy?: string
  assignedTo?: string
  search?: string
  isArchived?: boolean
  dateFrom?: string
  dateTo?: string
  sortBy?: 'submitted_at' | 'updated_at' | 'deadline' | 'priority'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}
