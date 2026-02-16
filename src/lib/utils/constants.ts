import type { TaskCategory, TaskPriority, TaskStatus } from '@/lib/types'

// ---------------------------------------------------------------------------
// Category configuration
// ---------------------------------------------------------------------------

export interface CategoryConfig {
  label: string
  description: string
  icon: string
  color: string
}

export const CATEGORY_CONFIG: Record<TaskCategory, CategoryConfig> = {
  financial: {
    label: 'Financial',
    description: 'Budget approvals, invoices, expenses, and financial planning',
    icon: 'DollarSign',
    color: 'text-emerald-600 bg-emerald-50',
  },
  project: {
    label: 'Project',
    description: 'Project milestones, deliverables, and progress updates',
    icon: 'FolderKanban',
    color: 'text-blue-600 bg-blue-50',
  },
  hr_operations: {
    label: 'HR & Operations',
    description: 'Hiring, onboarding, office management, and team logistics',
    icon: 'Users',
    color: 'text-purple-600 bg-purple-50',
  },
  client_relations: {
    label: 'Client Relations',
    description: 'Client communications, proposals, and relationship management',
    icon: 'Handshake',
    color: 'text-amber-600 bg-amber-50',
  },
  pr_marketing: {
    label: 'PR & Marketing',
    description: 'Branding, social media, press releases, and outreach',
    icon: 'Megaphone',
    color: 'text-pink-600 bg-pink-50',
  },
  administrative: {
    label: 'Administrative',
    description: 'General admin, compliance, policies, and office tasks',
    icon: 'ClipboardList',
    color: 'text-slate-600 bg-slate-50',
  },
}

// ---------------------------------------------------------------------------
// Priority configuration
// ---------------------------------------------------------------------------

export interface PriorityConfig {
  label: string
  color: string
  sortOrder: number
}

export const PRIORITY_CONFIG: Record<TaskPriority, PriorityConfig> = {
  urgent: {
    label: 'Urgent',
    color: 'text-red-700 bg-red-50 border-red-200',
    sortOrder: 0,
  },
  high: {
    label: 'High',
    color: 'text-orange-700 bg-orange-50 border-orange-200',
    sortOrder: 1,
  },
  normal: {
    label: 'Normal',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    sortOrder: 2,
  },
  low: {
    label: 'Low',
    color: 'text-slate-600 bg-slate-50 border-slate-200',
    sortOrder: 3,
  },
}

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

export interface StatusConfig {
  label: string
  color: string
  isFinal: boolean
}

export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  pending: {
    label: 'Pending',
    color: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    isFinal: false,
  },
  in_review: {
    label: 'In Review',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    isFinal: false,
  },
  approved: {
    label: 'Approved',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    isFinal: true,
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700 bg-red-50 border-red-200',
    isFinal: true,
  },
  needs_more_info: {
    label: 'Needs More Info',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    isFinal: false,
  },
  deferred: {
    label: 'Deferred',
    color: 'text-slate-600 bg-slate-100 border-slate-200',
    isFinal: false,
  },
  delegated: {
    label: 'Delegated',
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    isFinal: false,
  },
  resolved: {
    label: 'Resolved',
    color: 'text-teal-700 bg-teal-50 border-teal-200',
    isFinal: true,
  },
}

// ---------------------------------------------------------------------------
// Resolution options available to the CEO
// ---------------------------------------------------------------------------

export interface ResolutionOption {
  value: TaskStatus
  label: string
  description: string
}

export const RESOLUTION_OPTIONS: ResolutionOption[] = [
  {
    value: 'approved',
    label: 'Approve',
    description: 'Approve this task as submitted',
  },
  {
    value: 'rejected',
    label: 'Reject',
    description: 'Reject this task with a reason',
  },
  {
    value: 'needs_more_info',
    label: 'Request More Info',
    description: 'Ask the submitter for additional details',
  },
  {
    value: 'deferred',
    label: 'Defer',
    description: 'Put this task on hold for later review',
  },
  {
    value: 'resolved',
    label: 'Mark Resolved',
    description: 'Mark this task as resolved',
  },
]

// ---------------------------------------------------------------------------
// Departments within the architectural firm
// ---------------------------------------------------------------------------

export const DEPARTMENTS = [
  'Architecture',
  'Interior Design',
  'Structural Engineering',
  'Project Management',
  'Business Development',
  'Finance & Admin',
  'Marketing',
] as const

export type Department = (typeof DEPARTMENTS)[number]
