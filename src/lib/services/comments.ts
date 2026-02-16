import { supabase } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Add a comment to a task
//
// Side-effect: if the task is currently in "needs_more_info" status and the
// commenter is the original submitter, automatically transition the task back
// to "pending" so the CEO is notified that additional information was provided.
// ---------------------------------------------------------------------------

export async function addComment(
  taskId: string,
  content: string,
  userId: string,
) {
  // Insert the comment
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

  // Check whether we should auto-update the task status
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('status, submitted_by')
    .eq('id', taskId)
    .single()

  if (taskError) throw taskError

  if (task.status === 'needs_more_info' && task.submitted_by === userId) {
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ status: 'pending' as const })
      .eq('id', taskId)

    if (updateError) throw updateError
  }

  return comment
}
