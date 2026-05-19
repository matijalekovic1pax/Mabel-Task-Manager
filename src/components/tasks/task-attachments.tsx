import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  MAX_ATTACHMENT_TOTAL_BYTES,
  MAX_ATTACHMENT_TOTAL_LABEL,
  TASK_DOCUMENT_ACCEPT,
  assertAttachmentTotalLimit,
  assertTaskDocumentFile,
  deleteTaskAttachment,
  formatAttachmentSize,
  getAttachmentTotalSize,
  getSignedAttachmentUrl,
  isDocumentAttachment,
  listTaskAttachments,
  uploadTaskFile,
} from '@/lib/services/attachments'
import type { TaskAttachment } from '@/lib/types'

type Props = {
  taskId: string
  currentUserId: string
  canUpload: boolean
  isAdmin: boolean
}

export function TaskAttachments({ taskId, currentUserId, canUpload, isAdmin }: Props) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = (await listTaskAttachments(taskId)).filter(isDocumentAttachment)
      setAttachments(rows)
      const entries = await Promise.all(
        rows.map(async (attachment) => (
          [attachment.id, await getSignedAttachmentUrl(attachment.storage_path)] as const
        )),
      )
      setUrls(Object.fromEntries(entries))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => { void load() }, [load])

  const totalBytes = getAttachmentTotalSize(attachments)
  const remainingBytes = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - totalBytes)
  const limitReached = remainingBytes <= 0

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return

    const toUpload: File[] = []
    let nextTotalBytes = totalBytes

    for (const file of Array.from(files)) {
      try {
        assertTaskDocumentFile(file)
        assertAttachmentTotalLimit(nextTotalBytes, file.size, file.name)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not add ${file.name}`)
        continue
      }

      toUpload.push(file)
      nextTotalBytes += file.size
    }

    if (toUpload.length === 0) return

    setUploading(true)
    try {
      for (const file of toUpload) {
        try {
          await uploadTaskFile(taskId, currentUserId, file)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`)
        }
      }
      await load()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function onDelete(attachment: TaskAttachment) {
    setDeletingId(attachment.id)
    try {
      await deleteTaskAttachment(attachment)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete file')
    } finally {
      setDeletingId(null)
    }
  }

  const showEmpty = !loading && attachments.length === 0
  if (!canUpload && attachments.length === 0 && !loading) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">
          Files <span className="text-xs font-normal text-muted-foreground">({formatAttachmentSize(totalBytes)} / {MAX_ATTACHMENT_TOTAL_LABEL})</span>
        </CardTitle>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={TASK_DOCUMENT_ACCEPT}
              hidden
              onChange={(event) => onFilesSelected(event.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading || limitReached}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {limitReached ? 'Limit reached' : 'Add files'}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {canUpload && !loading && (
          <p className="mb-3 text-xs text-muted-foreground">
            Upload PDF, Word, or Excel documents. {formatAttachmentSize(remainingBytes)} remaining.
          </p>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading files...
          </div>
        ) : showEmpty ? (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {attachments.map((attachment) => {
              const url = urls[attachment.id]
              const canDelete = isAdmin || attachment.uploaded_by === currentUserId
              const isDeleting = deletingId === attachment.id
              return (
                <div key={attachment.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{attachment.file_name}</p>
                    <p className="text-xs text-muted-foreground">{formatAttachmentSize(attachment.file_size)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {url && (
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${attachment.file_name}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span className="hidden sm:inline">Open</span>
                        </a>
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={isDeleting}
                        onClick={() => onDelete(attachment)}
                        aria-label={`Delete ${attachment.file_name}`}
                      >
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
