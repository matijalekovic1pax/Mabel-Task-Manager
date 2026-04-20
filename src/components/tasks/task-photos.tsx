import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  MAX_PHOTOS_PER_TASK,
  deleteTaskAttachment,
  getSignedAttachmentUrl,
  listTaskAttachments,
  uploadTaskPhoto,
} from '@/lib/services/attachments'
import type { TaskAttachment } from '@/lib/types'

type Props = {
  taskId: string
  currentUserId: string
  canUpload: boolean
  isAdmin: boolean
}

export function TaskPhotos({ taskId, currentUserId, canUpload, isAdmin }: Props) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listTaskAttachments(taskId)
      const imageRows = rows.filter((r) => r.file_type.startsWith('image/'))
      setAttachments(imageRows)
      const entries = await Promise.all(
        imageRows.map(async (r) => [r.id, await getSignedAttachmentUrl(r.storage_path)] as const),
      )
      setUrls(Object.fromEntries(entries))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => { void load() }, [load])

  const remaining = MAX_PHOTOS_PER_TASK - attachments.length

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const toUpload = Array.from(files).slice(0, remaining)
    if (toUpload.length < files.length) {
      toast.warning(`Only ${remaining} slot${remaining === 1 ? '' : 's'} left — extra files skipped`)
    }
    if (toUpload.length === 0) return

    setUploading(true)
    try {
      for (const file of toUpload) {
        try {
          await uploadTaskPhoto(taskId, currentUserId, file)
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
      toast.error(err instanceof Error ? err.message : 'Failed to delete photo')
    } finally {
      setDeletingId(null)
    }
  }

  const showEmpty = !loading && attachments.length === 0
  if (!canUpload && attachments.length === 0 && !loading) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Photos <span className="text-xs font-normal text-muted-foreground">({attachments.length}/{MAX_PHOTOS_PER_TASK})</span>
        </CardTitle>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onFilesSelected(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading || remaining <= 0}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {remaining <= 0 ? 'Limit reached' : 'Add photos'}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
          </div>
        ) : showEmpty ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {attachments.map((a) => {
              const url = urls[a.id]
              const canDelete = isAdmin || a.uploaded_by === currentUserId
              const isDeleting = deletingId === a.id
              return (
                <div key={a.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                      <img
                        src={url}
                        alt={a.file_name}
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(a)}
                      disabled={isDeleting}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                      aria-label="Delete photo"
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
