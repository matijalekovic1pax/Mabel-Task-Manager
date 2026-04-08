import { supabase } from '@/lib/supabase/client'
import type { PersonalTodo, PersonalTodoItem, PersonalTodoWithItems } from '@/lib/types'

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
// Fetch a single todo with its checklist items
// ---------------------------------------------------------------------------

export async function getPersonalTodo(id: string): Promise<PersonalTodoWithItems | null> {
  const [{ data: todo, error: todoErr }, { data: items, error: itemsErr }] = await Promise.all([
    supabase.from('personal_todos').select('*').eq('id', id).maybeSingle(),
    supabase.from('personal_todo_items').select('*').eq('todo_id', id).order('created_at', { ascending: true }),
  ])

  if (todoErr) throw todoErr
  if (itemsErr) throw itemsErr
  if (!todo) return null

  return { ...todo, items: items ?? [] }
}

// ---------------------------------------------------------------------------
// Create a new todo
// ---------------------------------------------------------------------------

export async function createPersonalTodo(
  userId: string,
  fields: {
    title: string
    description?: string | null
    priority?: PersonalTodo['priority']
    due_date?: string | null
  },
): Promise<PersonalTodo> {
  const { data, error } = await supabase
    .from('personal_todos')
    .insert({
      user_id: userId,
      title: fields.title.trim(),
      description: fields.description ?? null,
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
  updates: Partial<Pick<PersonalTodo, 'title' | 'description' | 'status' | 'priority' | 'due_date'>>,
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
// Delete a todo (and its items, via ON DELETE CASCADE)
// ---------------------------------------------------------------------------

export async function deletePersonalTodo(id: string): Promise<void> {
  const { error } = await supabase
    .from('personal_todos')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------

export async function createTodoItem(todoId: string, text: string): Promise<PersonalTodoItem> {
  const { data, error } = await supabase
    .from('personal_todo_items')
    .insert({ todo_id: todoId, text: text.trim() })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateTodoItem(
  id: string,
  updates: Partial<Pick<PersonalTodoItem, 'text' | 'is_done'>>,
): Promise<PersonalTodoItem> {
  const { data, error } = await supabase
    .from('personal_todo_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTodoItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('personal_todo_items')
    .delete()
    .eq('id', id)

  if (error) throw error
}
