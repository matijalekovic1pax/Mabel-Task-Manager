import { supabase } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/image'
import type { TaskAttachment } from '@/lib/types'

export const MAX_PHOTOS_PER_TASK = 5
const BUCKET = 'task-attachments'

export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function uploadTaskPhoto(
  taskId: string,
  userId: string,
  file: File,
): Promise<TaskAttachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed')
  }

  const { count, error: countError } = await supabase
    .from('task_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId)

  if (countError) throw countError
  if ((count ?? 0) >= MAX_PHOTOS_PER_TASK) {
    throw new Error(`Up to ${MAX_PHOTOS_PER_TASK} photos per task`)
  }

  const blob = await compressImage(file)
  return uploadCompressedBlob(taskId, userId, blob, file.name)
}

// Upload an already-compressed blob. Used when photos were staged client-side
// (e.g. on the new-task form) and compression happened at selection time.
export async function uploadCompressedBlob(
  taskId: string,
  userId: string,
  blob: Blob,
  fileName: string,
): Promise<TaskAttachment> {
  const path = `${taskId}/${crypto.randomUUID()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw uploadError

  const { data: row, error: insertError } = await supabase
    .from('task_attachments')
    .insert({
      task_id: taskId,
      uploaded_by: userId,
      file_name: fileName,
      file_size: blob.size,
      file_type: 'image/jpeg',
      storage_path: path,
    })
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw insertError
  }
  return row
}

export async function deleteTaskAttachment(attachment: TaskAttachment): Promise<void> {
  const { error: rowError } = await supabase
    .from('task_attachments')
    .delete()
    .eq('id', attachment.id)
  if (rowError) throw rowError

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([attachment.storage_path])
  if (storageError) throw storageError
}

export async function getSignedAttachmentUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}
