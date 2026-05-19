import { useRef } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MAX_ATTACHMENT_TOTAL_BYTES,
  MAX_ATTACHMENT_TOTAL_LABEL,
  TASK_DOCUMENT_ACCEPT,
  assertAttachmentTotalLimit,
  assertTaskDocumentFile,
  formatAttachmentSize,
  getAttachmentTotalSize,
} from '@/lib/services/attachments'
import { toast } from 'sonner'

export type TaskFileDraft = {
  id: string
  file: File
  fileName: string
  fileType: string
  fileSize: number
}

type Props = {
  drafts: TaskFileDraft[]
  onChange: (drafts: TaskFileDraft[]) => void
  disabled?: boolean
}

export function TaskFileDraftPicker({ drafts, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const totalBytes = getAttachmentTotalSize(drafts.map((draft) => ({ file_size: draft.fileSize })))
  const remainingBytes = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - totalBytes)
  const limitReached = remainingBytes <= 0

  function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return

    const next: TaskFileDraft[] = [...drafts]
    let nextTotalBytes = totalBytes

    for (const file of Array.from(files)) {
      try {
        assertTaskDocumentFile(file)
        assertAttachmentTotalLimit(nextTotalBytes, file.size, file.name)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not add ${file.name}`)
        continue
      }

      next.push({
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      })
      nextTotalBytes += file.size
    }

    onChange(next)
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeDraft(id: string) {
    onChange(drafts.filter((draft) => draft.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          PDF, Word, or Excel - {formatAttachmentSize(totalBytes)} of {MAX_ATTACHMENT_TOTAL_LABEL} used
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={TASK_DOCUMENT_ACCEPT}
          hidden
          onChange={(event) => onFilesSelected(event.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || limitReached}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
          {limitReached ? 'Limit reached' : 'Add files'}
        </Button>
      </div>

      {drafts.length > 0 && (
        <div className="divide-y rounded-md border">
          {drafts.map((draft) => (
            <div key={draft.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{draft.fileName}</p>
                <p className="text-xs text-muted-foreground">{formatAttachmentSize(draft.fileSize)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeDraft(draft.id)}
                disabled={disabled}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                aria-label={`Remove ${draft.fileName}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
