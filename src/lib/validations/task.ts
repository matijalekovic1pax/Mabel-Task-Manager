import { z } from 'zod'

// ---------------------------------------------------------------------------
// Task submission schema
// ---------------------------------------------------------------------------

export const taskSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title must be at most 200 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be at most 5,000 characters'),
  category: z.enum([
    'financial',
    'project',
    'hr_operations',
    'client_relations',
    'pr_marketing',
    'administrative',
  ]),
  priority: z.enum(['urgent', 'high', 'normal', 'low']),
  deadline: z.string().nullable().optional(),
})

export type TaskInput = z.infer<typeof taskSchema>

// ---------------------------------------------------------------------------
// Resolution schema (CEO resolving a task)
// ---------------------------------------------------------------------------

export const resolutionSchema = z.object({
  status: z.enum([
    'approved',
    'rejected',
    'needs_more_info',
    'deferred',
    'resolved',
  ]),
  resolution_note: z
    .string()
    .max(2000, 'Resolution note must be at most 2,000 characters')
    .optional(),
})

export type ResolutionInput = z.infer<typeof resolutionSchema>

// ---------------------------------------------------------------------------
// Delegation schema (CEO delegating a task)
// ---------------------------------------------------------------------------

export const delegationSchema = z.object({
  assigned_to: z.string().uuid('Please select a team member'),
  delegation_note: z
    .string()
    .max(2000, 'Delegation note must be at most 2,000 characters')
    .optional(),
})

export type DelegationInput = z.infer<typeof delegationSchema>

// ---------------------------------------------------------------------------
// Comment schema
// ---------------------------------------------------------------------------

export const commentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment must be at most 2,000 characters'),
})

export type CommentInput = z.infer<typeof commentSchema>
