import { supabase } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Add a comment to a task
// ---------------------------------------------------------------------------

export async function addComment(
  taskId: string,
  content: string,
  userId: string,
) {
  const { data: comment, error: commentError } = await supabase
    .from('task_comments')
    .insert({
      task_id: taskId,
      author_id: userId,
      content,
    })
    .select('*, author:profiles!task_comments_author_id_fkey(*)')
    .single()

  if (commentError) throw commentError

  return comment
}
