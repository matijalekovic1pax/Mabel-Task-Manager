export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'ceo' | 'team_member' | 'super_admin'
          avatar_url: string | null
          department: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role?: 'ceo' | 'team_member' | 'super_admin'
          avatar_url?: string | null
          department?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'ceo' | 'team_member' | 'super_admin'
          avatar_url?: string | null
          department?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string
          category: Database['public']['Enums']['task_category']
          priority: Database['public']['Enums']['task_priority']
          status: Database['public']['Enums']['task_status']
          submitted_by: string
          resolved_by: string | null
          assigned_to: string | null
          delegation_note: string | null
          deadline: string | null
          submitted_at: string
          resolved_at: string | null
          updated_at: string
          resolution_note: string | null
          is_archived: boolean
          reference_number: string
          file_link: string | null
          task_type: 'approval' | 'general'
          visibility: 'private' | 'company'
        }
        Insert: {
          id?: string
          title: string
          description: string
          category: Database['public']['Enums']['task_category']
          priority: Database['public']['Enums']['task_priority']
          status?: Database['public']['Enums']['task_status']
          submitted_by: string
          resolved_by?: string | null
          assigned_to?: string | null
          delegation_note?: string | null
          deadline?: string | null
          submitted_at?: string
          resolved_at?: string | null
          updated_at?: string
          resolution_note?: string | null
          is_archived?: boolean
          reference_number?: string
          file_link?: string | null
          task_type?: 'approval' | 'general'
          visibility?: 'private' | 'company'
        }
        Update: {
          id?: string
          title?: string
          description?: string
          category?: Database['public']['Enums']['task_category']
          priority?: Database['public']['Enums']['task_priority']
          status?: Database['public']['Enums']['task_status']
          submitted_by?: string
          resolved_by?: string | null
          assigned_to?: string | null
          delegation_note?: string | null
          deadline?: string | null
          submitted_at?: string
          resolved_at?: string | null
          updated_at?: string
          resolution_note?: string | null
          is_archived?: boolean
          reference_number?: string
          file_link?: string | null
          task_type?: 'approval' | 'general'
          visibility?: 'private' | 'company'
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_submitted_by_fkey'
            columns: ['submitted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_resolved_by_fkey'
            columns: ['resolved_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      task_comments: {
        Row: {
          id: string
          task_id: string
          author_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          author_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          author_id?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'task_comments_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      task_attachments: {
        Row: {
          id: string
          task_id: string
          uploaded_by: string
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          uploaded_by: string
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          uploaded_by?: string
          file_name?: string
          file_size?: number
          file_type?: string
          storage_path?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'task_attachments_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_attachments_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      task_events: {
        Row: {
          id: string
          task_id: string
          actor_id: string
          action: string
          from_status: Database['public']['Enums']['task_status']
          to_status: Database['public']['Enums']['task_status']
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          actor_id: string
          action: string
          from_status: Database['public']['Enums']['task_status']
          to_status: Database['public']['Enums']['task_status']
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          actor_id?: string
          action?: string
          from_status?: Database['public']['Enums']['task_status']
          to_status?: Database['public']['Enums']['task_status']
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'task_events_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_events_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          recipient_id: string
          type: Database['public']['Enums']['notification_type']
          title: string
          message: string
          task_id: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          type: Database['public']['Enums']['notification_type']
          title: string
          message: string
          task_id?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          type?: Database['public']['Enums']['notification_type']
          title?: string
          message?: string
          task_id?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_recipient_id_fkey'
            columns: ['recipient_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      task_assignees: {
        Row: {
          id: string
          task_id: string
          assignee_id: string
          assigned_by: string
          assigned_at: string
        }
        Insert: {
          id?: string
          task_id: string
          assignee_id: string
          assigned_by: string
          assigned_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          assignee_id?: string
          assigned_by?: string
          assigned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'task_assignees_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_assignees_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_assignees_assigned_by_fkey'
            columns: ['assigned_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      allowed_emails: {
        Row: {
          id: string
          email: string
          role: 'ceo' | 'team_member' | 'super_admin'
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          role?: 'ceo' | 'team_member' | 'super_admin'
          added_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'ceo' | 'team_member' | 'super_admin'
          added_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'allowed_emails_added_by_fkey'
            columns: ['added_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      personal_todos: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          status: 'todo' | 'in_progress' | 'done'
          priority: 'urgent' | 'high' | 'normal' | 'low'
          due_date: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          priority?: 'urgent' | 'high' | 'normal' | 'low'
          due_date?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          priority?: 'urgent' | 'high' | 'normal' | 'low'
          due_date?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'personal_todos_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      personal_todo_items: {
        Row: {
          id: string
          todo_id: string
          text: string
          is_done: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          todo_id: string
          text: string
          is_done?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          todo_id?: string
          text?: string
          is_done?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'personal_todo_items_todo_id_fkey'
            columns: ['todo_id']
            isOneToOne: false
            referencedRelation: 'personal_todos'
            referencedColumns: ['id']
          },
        ]
      }
      personal_todo_links: {
        Row: {
          id: string
          todo_id: string
          url: string
          label: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          todo_id: string
          url: string
          label?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          todo_id?: string
          url?: string
          label?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'personal_todo_links_todo_id_fkey'
            columns: ['todo_id']
            isOneToOne: false
            referencedRelation: 'personal_todos'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      transition_task: {
        Args: {
          p_task_id: string
          p_action: string
          p_note?: string | null
          p_assigned_to?: string | null
        }
        Returns: Database['public']['Tables']['tasks']['Row']
      }
      update_general_task_status: {
        Args: {
          p_task_id: string
          p_status: string
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['tasks']['Row']
      }
      transition_general_task: {
        Args: {
          p_task_id: string
          p_action: string
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['tasks']['Row']
      }
    }
    Enums: {
      task_category:
        | 'financial'
        | 'project'
        | 'hr_operations'
        | 'client_relations'
        | 'pr_marketing'
        | 'administrative'
      task_priority: 'urgent' | 'high' | 'normal' | 'low'
      task_status:
        | 'pending'
        | 'in_review'
        | 'approved'
        | 'rejected'
        | 'needs_more_info'
        | 'deferred'
        | 'delegated'
        | 'resolved'
        | 'todo'
        | 'in_progress'
        | 'blocked'
        | 'done'
        | 'cancelled'
      notification_type:
        | 'task_submitted'
        | 'task_resolved'
        | 'needs_more_info'
        | 'info_provided'
        | 'task_delegated'
        | 'task_updated'
        | 'comment_added'
        | 'deadline_approaching'
        | 'task_overdue'
        | 'task_assigned'
        | 'task_completed'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

type Tables = Database['public']['Tables']

export type Profile = Tables['profiles']['Row']
export type Task = Tables['tasks']['Row']
export type TaskComment = Tables['task_comments']['Row']
export type TaskAttachment = Tables['task_attachments']['Row']
export type TaskEvent = Tables['task_events']['Row']
export type Notification = Tables['notifications']['Row']
export type AllowedEmail = Tables['allowed_emails']['Row']
export type TaskAssignee = Tables['task_assignees']['Row']

export type TaskCategory = Database['public']['Enums']['task_category']
export type TaskPriority = Database['public']['Enums']['task_priority']
export type TaskStatus = Database['public']['Enums']['task_status']
export type NotificationType = Database['public']['Enums']['notification_type']

export type ProfileInsert = Tables['profiles']['Insert']
export type TaskInsert = Tables['tasks']['Insert']
export type TaskCommentInsert = Tables['task_comments']['Insert']
export type TaskAttachmentInsert = Tables['task_attachments']['Insert']
export type TaskEventInsert = Tables['task_events']['Insert']
export type NotificationInsert = Tables['notifications']['Insert']
export type AllowedEmailInsert = Tables['allowed_emails']['Insert']
export type TaskAssigneeInsert = Tables['task_assignees']['Insert']

export type PersonalTodo = Tables['personal_todos']['Row']
export type PersonalTodoInsert = Tables['personal_todos']['Insert']
export type PersonalTodoUpdate = Tables['personal_todos']['Update']
export type PersonalTodoItem = Tables['personal_todo_items']['Row']
export type PersonalTodoItemInsert = Tables['personal_todo_items']['Insert']
export type PersonalTodoLink = Tables['personal_todo_links']['Row']
export type PersonalTodoLinkInsert = Tables['personal_todo_links']['Insert']

/** A todo with its checklist items and links loaded */
export type PersonalTodoWithItems = PersonalTodo & {
  items: PersonalTodoItem[]
  links: PersonalTodoLink[]
}

export type TaskAction =
  | 'request_info'
  | 'delegate'
  | 'approve'
  | 'reject'
  | 'defer'
  | 'resolve'
  | 'mark_ready'
  | 'provide_info'

/** Named transitions for the general-task workflow (migrations 013, 014). */
export type GeneralTaskAction =
  | 'start'
  | 'send_for_review'
  | 'approve_close'
  | 'complete'
  | 'send_back'
  | 'block'
  | 'resume'
  | 'reopen'
  | 'cancel'

/** Task with the submitter's profile joined. */
export type TaskWithSubmitter = Task & {
  submitter: Profile
  /** Loaded for general-task list views so assignees cannot self-review. */
  assignees?: TaskAssignee[]
}

/** Fully-loaded task with all related data joined. */
export type TaskWithDetails = Task & {
  submitter: Profile
  assignee: Profile | null
  resolver: Profile | null
  comments: (TaskComment & { author: Profile })[]
  attachments: TaskAttachment[]
  events: (TaskEvent & { actor: Profile })[]
  /** Populated for general tasks: the full list of assignees */
  assignees?: (TaskAssignee & { assignee: Profile })[]
}

/** Status values used by the general task workflow */
export type GeneralTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done' | 'cancelled'
