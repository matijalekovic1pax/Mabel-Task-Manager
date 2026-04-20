// Vercel cron target: hard-deletes tasks that reached a terminal status more
// than 30 days ago, plus any attachment rows and storage files they own.
// The schedule lives in vercel.json. Auth is the CRON_SECRET bearer token
// Vercel injects when invoking cron routes.

import { createClient } from '@supabase/supabase-js'

const TERMINAL_STATUSES = ['done', 'cancelled', 'approved', 'rejected', 'resolved'] as const
const CUTOFF_DAYS = 30
const ATTACHMENTS_BUCKET = 'task-attachments'

export default async function handler(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return jsonError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: tasks, error: selectError } = await supabase
    .from('tasks')
    .select('id, resolved_at, status')
    .in('status', TERMINAL_STATUSES as unknown as string[])
    .not('resolved_at', 'is', null)
    .lt('resolved_at', cutoff)

  if (selectError) return jsonError(`select tasks: ${selectError.message}`, 500)

  const taskIds = (tasks ?? []).map((t) => t.id)
  if (taskIds.length === 0) {
    return jsonOk({ deletedTasks: 0, deletedObjects: 0 })
  }

  // Collect storage paths so we can remove the files after the rows cascade.
  const { data: attachments, error: attachError } = await supabase
    .from('task_attachments')
    .select('storage_path')
    .in('task_id', taskIds)

  if (attachError) return jsonError(`select attachments: ${attachError.message}`, 500)

  const storagePaths = (attachments ?? []).map((a) => a.storage_path).filter(Boolean)

  // Delete task rows. Cascade removes task_attachments, comments, events,
  // assignees, and notifications pointing at these tasks.
  const { error: deleteError } = await supabase.from('tasks').delete().in('id', taskIds)
  if (deleteError) return jsonError(`delete tasks: ${deleteError.message}`, 500)

  let deletedObjects = 0
  if (storagePaths.length > 0) {
    // Chunk to be safe with very large batches.
    for (let i = 0; i < storagePaths.length; i += 100) {
      const chunk = storagePaths.slice(i, i + 100)
      const { data: removed, error: storageError } = await supabase
        .storage
        .from(ATTACHMENTS_BUCKET)
        .remove(chunk)
      if (storageError) {
        return jsonError(`remove objects: ${storageError.message}`, 500)
      }
      deletedObjects += removed?.length ?? 0
    }
  }

  return jsonOk({ deletedTasks: taskIds.length, deletedObjects, cutoff })
}

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
