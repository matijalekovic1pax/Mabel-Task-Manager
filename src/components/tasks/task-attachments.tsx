import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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

type ImageSize = {
  width: number
  height: number
}

function isImageAttachment(attachment: TaskAttachment): boolean {
  return attachment.file_type.startsWith('image/')
}

function fitImageSize(imageSize: ImageSize | null, viewportSize: ImageSize): ImageSize | null {
  if (!imageSize || viewportSize.width <= 0 || viewportSize.height <= 0) return null

  const maxWidth = Math.max(280, viewportSize.width - 48)
  const maxHeight = Math.max(240, viewportSize.height - 132)
  const scale = Math.min(maxWidth / imageSize.width, maxHeight / imageSize.height)

  return {
    width: Math.round(imageSize.width * scale),
    height: Math.round(imageSize.height * scale),
  }
}

export function TaskAttachments({ taskId, currentUserId, canUpload, isAdmin }: Props) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [imageSizes, setImageSizes] = useState<Record<string, ImageSize>>({})
  const [viewportSize, setViewportSize] = useState<ImageSize>({ width: 0, height: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const imageAttachments = useMemo(
    () => attachments.filter(isImageAttachment),
    [attachments],
  )
  const documentAttachments = useMemo(
    () => attachments.filter((attachment) => !isImageAttachment(attachment)),
    [attachments],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listTaskAttachments(taskId)
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

  useEffect(() => {
    if (selectedImageIndex === null) return
    if (imageAttachments.length === 0) {
      setSelectedImageIndex(null)
      return
    }
    if (selectedImageIndex > imageAttachments.length - 1) {
      setSelectedImageIndex(imageAttachments.length - 1)
    }
  }, [imageAttachments.length, selectedImageIndex])

  useEffect(() => {
    if (selectedImageIndex === null) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') {
        setSelectedImageIndex((index) => (index === null ? index : Math.max(0, index - 1)))
      }
      if (event.key === 'ArrowRight') {
        setSelectedImageIndex((index) => (
          index === null ? index : Math.min(imageAttachments.length - 1, index + 1)
        ))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [imageAttachments.length, selectedImageIndex])

  const selectedAttachment = selectedImageIndex === null ? null : imageAttachments[selectedImageIndex] ?? null
  const selectedUrl = selectedAttachment ? urls[selectedAttachment.id] : null
  const selectedImageSize = selectedAttachment ? imageSizes[selectedAttachment.id] ?? null : null
  const fittedImageSize = fitImageSize(selectedImageSize, viewportSize)
  const canGoPrevious = selectedImageIndex !== null && selectedImageIndex > 0
  const canGoNext = selectedImageIndex !== null && selectedImageIndex < imageAttachments.length - 1
  const totalBytes = getAttachmentTotalSize(attachments)
  const remainingBytes = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - totalBytes)
  const limitReached = remainingBytes <= 0

  useEffect(() => {
    if (!selectedAttachment) return

    function updateViewportSize() {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight })
    }

    updateViewportSize()
    window.addEventListener('resize', updateViewportSize)
    return () => window.removeEventListener('resize', updateViewportSize)
  }, [selectedAttachment])

  useEffect(() => {
    if (!selectedAttachment || !selectedUrl || selectedImageSize) return

    let cancelled = false
    const image = new window.Image()
    image.onload = () => {
      if (cancelled) return
      setImageSizes((sizes) => ({
        ...sizes,
        [selectedAttachment.id]: {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
      }))
    }
    image.src = selectedUrl

    return () => { cancelled = true }
  }, [selectedAttachment, selectedImageSize, selectedUrl])

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
    <>
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
            <div className="space-y-4">
              {imageAttachments.length > 0 && (
                <div className="space-y-2">
                  {documentAttachments.length > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Images
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {imageAttachments.map((attachment, index) => {
                      const url = urls[attachment.id]
                      const canDelete = isAdmin || attachment.uploaded_by === currentUserId
                      const isDeleting = deletingId === attachment.id
                      return (
                        <div key={attachment.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                          {url ? (
                            <button
                              type="button"
                              onClick={() => setSelectedImageIndex(index)}
                              className="block h-full w-full cursor-zoom-in text-left"
                              aria-label={`Open image ${index + 1} of ${imageAttachments.length}: ${attachment.file_name}`}
                            >
                              <img
                                src={url}
                                alt={attachment.file_name}
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
                              onClick={() => onDelete(attachment)}
                              disabled={isDeleting}
                              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                              aria-label={`Delete ${attachment.file_name}`}
                            >
                              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {documentAttachments.length > 0 && (
                <div className="space-y-2">
                  {imageAttachments.length > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      Documents
                    </p>
                  )}
                  <div className="divide-y rounded-md border">
                    {documentAttachments.map((attachment) => {
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
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedAttachment} onOpenChange={(open) => { if (!open) setSelectedImageIndex(null) }}>
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-none gap-0 overflow-hidden border-0 bg-zinc-950 p-0 text-white shadow-2xl"
        >
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          <DialogDescription className="sr-only">
            Browse task images with previous and next controls.
          </DialogDescription>

          <div
            className="relative flex items-center justify-center bg-black"
            style={fittedImageSize ? { width: fittedImageSize.width, height: fittedImageSize.height } : { width: 'min(96vw, 1280px)', height: 'min(76dvh, 860px)' }}
          >
            {selectedUrl ? (
              <img
                src={selectedUrl}
                alt={selectedAttachment?.file_name ?? 'Task image'}
                className="block h-full w-full object-contain"
                onLoad={(event) => {
                  if (!selectedAttachment) return
                  const image = event.currentTarget
                  setImageSizes((sizes) => sizes[selectedAttachment.id] ? sizes : {
                    ...sizes,
                    [selectedAttachment.id]: {
                      width: image.naturalWidth || image.width,
                      height: image.naturalHeight || image.height,
                    },
                  })
                }}
              />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            )}

            <DialogClose asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-3 top-3 bg-black/60 text-white hover:bg-white/15 hover:text-white"
                aria-label="Close image preview"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>

            {imageAttachments.length > 1 && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={!canGoPrevious}
                  onClick={() => setSelectedImageIndex((index) => (index === null ? index : Math.max(0, index - 1)))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={!canGoNext}
                  onClick={() => setSelectedImageIndex((index) => (
                    index === null ? index : Math.min(imageAttachments.length - 1, index + 1)
                  ))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
                  aria-label="Next image"
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
                {selectedImageIndex === null ? 0 : selectedImageIndex + 1} of {imageAttachments.length}
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
