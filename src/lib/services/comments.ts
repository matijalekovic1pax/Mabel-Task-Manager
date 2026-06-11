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

// ---------------------------------------------------------------------------
// Delete a comment (author only, enforced by RLS)
// ---------------------------------------------------------------------------

export async function deleteComment(commentId: string): Promise<void> {
  const { data, error } = await supabase
    .from('task_comments')
    .delete()
    .eq('id', commentId)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Delete failed - you may not have permission to delete this comment.')
  }
}
