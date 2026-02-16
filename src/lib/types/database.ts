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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
export type Notification = Tables['notifications']['Row']
export type AllowedEmail = Tables['allowed_emails']['Row']

export type TaskCategory = Database['public']['Enums']['task_category']
export type TaskPriority = Database['public']['Enums']['task_priority']
export type TaskStatus = Database['public']['Enums']['task_status']
export type NotificationType = Database['public']['Enums']['notification_type']

export type ProfileInsert = Tables['profiles']['Insert']
export type TaskInsert = Tables['tasks']['Insert']
export type TaskCommentInsert = Tables['task_comments']['Insert']
export type TaskAttachmentInsert = Tables['task_attachments']['Insert']
export type NotificationInsert = Tables['notifications']['Insert']
export type AllowedEmailInsert = Tables['allowed_emails']['Insert']

/** Task with the submitter's profile joined. */
export type TaskWithSubmitter = Task & {
  submitter: Profile
}

/** Fully-loaded task with all related data joined. */
export type TaskWithDetails = Task & {
  submitter: Profile
  assignee: Profile | null
  resolver: Profile | null
  comments: (TaskComment & { author: Profile })[]
  attachments: TaskAttachment[]
}
