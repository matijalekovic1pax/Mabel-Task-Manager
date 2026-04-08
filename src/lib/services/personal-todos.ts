import { supabase } from '@/lib/supabase/client'
import type { PersonalTodo } from '@/lib/types'

// ---------------------------------------------------------------------------
// Fetch all todos for the current user (newest first)
// ---------------------------------------------------------------------------

export async function getPersonalTodos(userId: string): Promise<PersonalTodo[]> {
  const { data, error } = await supabase
    .from('personal_todos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Create a new todo
// ---------------------------------------------------------------------------

export async function createPersonalTodo(
  userId: string,
  fields: {
    title: string
    notes?: string | null
    priority?: PersonalTodo['priority']
    due_date?: string | null
  },
): Promise<PersonalTodo> {
  const { data, error } = await supabase
    .from('personal_todos')
    .insert({
      user_id: userId,
      title: fields.title.trim(),
      notes: fields.notes ?? null,
      priority: fields.priority ?? 'normal',
      due_date: fields.due_date ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Update fields on an existing todo
// ---------------------------------------------------------------------------

export async function updatePersonalTodo(
  id: string,
  updates: Partial<Pick<PersonalTodo, 'title' | 'notes' | 'status' | 'priority' | 'due_date'>>,
): Promise<PersonalTodo> {
  const { data, error } = await supabase
    .from('personal_todos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Delete a todo
// ---------------------------------------------------------------------------

export async function deletePersonalTodo(id: string): Promise<void> {
  const { error } = await supabase
    .from('personal_todos')
    .delete()
    .eq('id', id)

  if (error) throw error
}
