import { supabase } from '@/lib/supabase/client'
import type {
  TaskFilters,
  TaskWithSubmitter,
  TaskWithDetails,
  TaskStatus,
  TaskCategory,
  TaskPriority,
} from '@/lib/types'
import type { TaskInput, ResolutionInput, DelegationInput } from '@/lib/validations/task'

// ---------------------------------------------------------------------------
// Create a new task
// ---------------------------------------------------------------------------

export async function createTask(data: TaskInput, userId: string) {
  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      deadline: data.deadline ?? null,
      submitted_by: userId,
      assigned_to: data.assigned_to ?? null,
      status: data.assigned_to ? 'delegated' : 'pending',
      file_link: data.file_link ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return task
}

// ---------------------------------------------------------------------------
// Get a filtered, sorted list of tasks with their submitter profile
// ---------------------------------------------------------------------------

export async function getTasks(
  filters?: TaskFilters,
): Promise<TaskWithSubmitter[]> {
  let query = supabase
    .from('tasks')
    .select('*, submitter:profiles!tasks_submitted_by_fkey(*)')

  // ----- Filters -----

  if (filters?.isArchived !== undefined) {
    query = query.eq('is_archived', filters.isArchived)
  } else {
    // Default: hide archived
    query = query.eq('is_archived', false)
  }

  if (filters?.status) {
    const statuses = (Array.isArray(filters.status)
      ? filters.status
      : [filters.status]) as TaskStatus[]
    query = query.in('status', statuses)
  }

  if (filters?.category) {
    const categories = (Array.isArray(filters.category)
      ? filters.category
      : [filters.category]) as TaskCategory[]
    query = query.in('category', categories)
  }

  if (filters?.priority) {
    const priorities = (Array.isArray(filters.priority)
      ? filters.priority
      : [filters.priority]) as TaskPriority[]
    query = query.in('priority', priorities)
  }

  if (filters?.submittedBy) {
    query = query.eq('submitted_by', filters.submittedBy)
  }

  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo)
  }

  if (filters?.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,reference_number.ilike.%${filters.search}%`,
    )
  }

  if (filters?.dateFrom) {
    query = query.gte('submitted_at', filters.dateFrom)
  }

  if (filters?.dateTo) {
    query = query.lte('submitted_at', filters.dateTo)
  }

  // ----- Sorting -----

  const sortBy = filters?.sortBy ?? 'submitted_at'
  const sortOrder = filters?.sortOrder ?? 'desc'
  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  // ----- Pagination -----

  if (filters?.limit) {
    const from = filters.offset ?? 0
    query = query.range(from, from + filters.limit - 1)
  }

  const { data, error } = await query

  if (error) throw error
  return (data ?? []) as unknown as TaskWithSubmitter[]
}

// ---------------------------------------------------------------------------
// Get a single task with all details
// ---------------------------------------------------------------------------

export async function getTask(taskId: string): Promise<TaskWithDetails> {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `
      *,
      submitter:profiles!tasks_submitted_by_fkey(*),
      assignee:profiles!tasks_assigned_to_fkey(*),
      resolver:profiles!tasks_resolved_by_fkey(*),
      comments:task_comments(*, author:profiles!task_comments_author_id_fkey(*)),
      attachments:task_attachments(*)
    `,
    )
    .eq('id', taskId)
    .single()

  if (error) throw error
  return data as unknown as TaskWithDetails
}

// ---------------------------------------------------------------------------
// Resolve a task (CEO action)
// ---------------------------------------------------------------------------

export async function resolveTask(
  taskId: string,
  data: ResolutionInput,
  userId: string,
) {
  const { data: task, error } = await supabase
    .from('tasks')
    .update({
      status: data.status,
      resolution_note: data.resolution_note ?? null,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return task
}

// ---------------------------------------------------------------------------
// Delegate a task to a team member (CEO action)
// ---------------------------------------------------------------------------

export async function delegateTask(
  taskId: string,
  data: DelegationInput,
) {
  const { data: task, error } = await supabase
    .from('tasks')
    .update({
      status: 'delegated' as const,
      assigned_to: data.assigned_to,
      delegation_note: data.delegation_note ?? null,
    })
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return task
}

// ---------------------------------------------------------------------------
// Archive a task
// ---------------------------------------------------------------------------

export async function archiveTask(taskId: string) {
  const { data: task, error } = await supabase
    .from('tasks')
    .update({ is_archived: true })
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return task
}
