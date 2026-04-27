import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
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

  useEffect(() => {
    if (selectedIndex === null) return
    if (attachments.length === 0) {
      setSelectedIndex(null)
      return
    }
    if (selectedIndex > attachments.length - 1) {
      setSelectedIndex(attachments.length - 1)
    }
  }, [attachments.length, selectedIndex])

  useEffect(() => {
    if (selectedIndex === null) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') {
        setSelectedIndex((index) => (index === null ? index : Math.max(0, index - 1)))
      }
      if (event.key === 'ArrowRight') {
        setSelectedIndex((index) => (index === null ? index : Math.min(attachments.length - 1, index + 1)))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [attachments.length, selectedIndex])

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

  const selectedAttachment = selectedIndex === null ? null : attachments[selectedIndex] ?? null
  const selectedUrl = selectedAttachment ? urls[selectedAttachment.id] : null
  const canGoPrevious = selectedIndex !== null && selectedIndex > 0
  const canGoNext = selectedIndex !== null && selectedIndex < attachments.length - 1

  return (
    <>
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
              {attachments.map((a, index) => {
                const url = urls[a.id]
                const canDelete = isAdmin || a.uploaded_by === currentUserId
                const isDeleting = deletingId === a.id
                return (
                  <div key={a.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                    {url ? (
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className="block h-full w-full cursor-zoom-in text-left"
                        aria-label={`Open photo ${index + 1} of ${attachments.length}: ${a.file_name}`}
                      >
                        <img
                          src={url}
                          alt={a.file_name}
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                          loading="lazy"
                        />
                      </button>
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

      <Dialog open={!!selectedAttachment} onOpenChange={(open) => { if (!open) setSelectedIndex(null) }}>
        <DialogContent
          showCloseButton={false}
          className="w-fit max-w-[calc(100vw-1rem)] gap-0 overflow-hidden border-0 bg-zinc-950 p-0 text-white shadow-2xl"
        >
          <DialogTitle className="sr-only">Photo preview</DialogTitle>
          <DialogDescription className="sr-only">
            Browse task photos with previous and next controls.
          </DialogDescription>

          <div className="relative flex min-h-24 min-w-[min(92vw,320px)] items-center justify-center bg-black">
            {selectedUrl ? (
              <img
                src={selectedUrl}
                alt={selectedAttachment?.file_name ?? 'Task photo'}
                className="block h-auto max-h-[calc(96vh-72px)] w-auto max-w-[calc(100vw-1rem)] object-contain"
              />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            )}

            <DialogClose asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-3 top-3 bg-black/45 text-white hover:bg-white/15 hover:text-white"
                aria-label="Close photo preview"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>

            {attachments.length > 1 && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={!canGoPrevious}
                  onClick={() => setSelectedIndex((index) => (index === null ? index : Math.max(0, index - 1)))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/45 text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={!canGoNext}
                  onClick={() => setSelectedIndex((index) => (index === null ? index : Math.min(attachments.length - 1, index + 1)))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/45 text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 bg-zinc-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{selectedAttachment?.file_name}</p>
              <p className="text-xs text-white/60">
                {selectedIndex === null ? 0 : selectedIndex + 1} of {attachments.length}
              </p>
            </div>
            {selectedUrl && (
              <Button asChild size="sm" variant="ghost" className="justify-start text-white hover:bg-white/10 hover:text-white sm:justify-center">
                <a href={selectedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open original
                </a>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
