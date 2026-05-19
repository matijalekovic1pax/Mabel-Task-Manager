import { supabase } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/image'
import type { TaskAttachment } from '@/lib/types'

export const MAX_ATTACHMENT_TOTAL_BYTES = 5 * 1024 * 1024
export const MAX_ATTACHMENT_TOTAL_LABEL = '5 MB'
export const MAX_PHOTOS_PER_TASK = 5
export const TASK_DOCUMENT_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',')

const BUCKET = 'task-attachments'

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const ALLOWED_DOCUMENT_MIME_TYPES = new Set(Object.values(DOCUMENT_MIME_BY_EXTENSION))

export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getAttachmentTotalSize(attachments: Pick<TaskAttachment, 'file_size'>[]): number {
  return attachments.reduce((total, attachment) => total + Number(attachment.file_size), 0)
}

export function isPhotoAttachment(attachment: Pick<TaskAttachment, 'file_type'>): boolean {
  return attachment.file_type.toLowerCase().startsWith('image/')
}

export function isDocumentAttachment(attachment: Pick<TaskAttachment, 'file_type'>): boolean {
  return !isPhotoAttachment(attachment)
}

export function getTaskDocumentExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{1,12})$/)
  return match?.[1] ?? ''
}

export function isAllowedTaskDocument(file: Pick<File, 'name' | 'type'>): boolean {
  const extension = getTaskDocumentExtension(file.name)
  return extension in DOCUMENT_MIME_BY_EXTENSION || ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)
}

export function getTaskDocumentMimeType(file: Pick<File, 'name' | 'type'>): string {
  const extension = getTaskDocumentExtension(file.name)
  return DOCUMENT_MIME_BY_EXTENSION[extension] ?? file.type
}

export function assertTaskDocumentFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (!isAllowedTaskDocument(file)) {
    throw new Error(`${file.name} is not supported. Upload PDF, Word, or Excel documents only.`)
  }

  if (file.size <= 0) {
    throw new Error(`${file.name} is empty`)
  }

  if (file.size > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new Error(`${file.name} is too large. Files must fit within the ${MAX_ATTACHMENT_TOTAL_LABEL} task limit.`)
  }
}

export function assertAttachmentTotalLimit(currentTotalBytes: number, incomingBytes: number, fileName = 'Selected files') {
  if (currentTotalBytes + incomingBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    const remaining = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - currentTotalBytes)
    throw new Error(
      `${fileName} would exceed the ${MAX_ATTACHMENT_TOTAL_LABEL} total limit. ${formatAttachmentSize(remaining)} remaining.`,
    )
  }
}

async function assertTaskHasDocumentCapacity(taskId: string, incomingBytes: number) {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('file_size, file_type')
    .eq('task_id', taskId)

  if (error) throw error
  assertAttachmentTotalLimit(getAttachmentTotalSize((data ?? []).filter(isDocumentAttachment)), incomingBytes)
}

async function assertTaskHasPhotoRoom(taskId: string) {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('id, file_type')
    .eq('task_id', taskId)

  if (error) throw error
  const count = (data ?? []).filter(isPhotoAttachment).length
  if (count >= MAX_PHOTOS_PER_TASK) {
    throw new Error(`Up to ${MAX_PHOTOS_PER_TASK} photos per task`)
  }
}

function getSafeExtension(fileName: string, fallback = ''): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{1,12})$/)
  return match ? `.${match[1]}` : fallback
}

export async function uploadTaskFile(
  taskId: string,
  userId: string,
  file: File,
): Promise<TaskAttachment> {
  assertTaskDocumentFile(file)
  await assertTaskHasDocumentCapacity(taskId, file.size)

  return uploadAttachmentBlob(
    taskId,
    userId,
    file,
    file.name,
    getTaskDocumentMimeType(file),
    getSafeExtension(file.name),
    false,
  )
}

export async function uploadTaskPhoto(
  taskId: string,
  userId: string,
  file: File,
): Promise<TaskAttachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed')
  }

  await assertTaskHasPhotoRoom(taskId)
  const blob = await compressImage(file)
  return uploadAttachmentBlob(taskId, userId, blob, file.name, 'image/jpeg', '.jpg', false)
}

// Upload an already-compressed blob. Used when photos were staged client-side
// (e.g. on the new-task form) and compression happened at selection time.
export async function uploadCompressedBlob(
  taskId: string,
  userId: string,
  blob: Blob,
  fileName: string,
): Promise<TaskAttachment> {
  return uploadAttachmentBlob(taskId, userId, blob, fileName, 'image/jpeg', '.jpg', false)
}

export async function uploadAttachmentBlob(
  taskId: string,
  userId: string,
  blob: Blob,
  fileName: string,
  fileType: string,
  extension = getSafeExtension(fileName),
  checkCapacity = true,
): Promise<TaskAttachment> {
  if (blob.size <= 0) {
    throw new Error(`${fileName} is empty`)
  }

  if (checkCapacity) {
    if (blob.size > MAX_ATTACHMENT_TOTAL_BYTES) {
      throw new Error(`${fileName} is too large. Files must fit within the ${MAX_ATTACHMENT_TOTAL_LABEL} task limit.`)
    }

    await assertTaskHasDocumentCapacity(taskId, blob.size)
  }

  const path = `${taskId}/${crypto.randomUUID()}${extension}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: fileType, upsert: false })
  if (uploadError) throw uploadError

  const { data: row, error: insertError } = await supabase
    .from('task_attachments')
    .insert({
      task_id: taskId,
      uploaded_by: userId,
      file_name: fileName,
      file_size: blob.size,
      file_type: fileType,
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
