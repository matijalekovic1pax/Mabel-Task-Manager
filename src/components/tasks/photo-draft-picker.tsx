import { useEffect, useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/utils/image'
import { MAX_PHOTOS_PER_TASK } from '@/lib/services/attachments'
import { toast } from 'sonner'

export type PhotoDraft = {
  id: string
  blob: Blob
  previewUrl: string
  fileName: string
}

type Props = {
  drafts: PhotoDraft[]
  onChange: (drafts: PhotoDraft[]) => void
  disabled?: boolean
}

export function PhotoDraftPicker({ drafts, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Revoke object URLs when drafts unmount to avoid leaks.
  useEffect(() => {
    return () => {
      drafts.forEach((d) => URL.revokeObjectURL(d.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remaining = MAX_PHOTOS_PER_TASK - drafts.length

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const toAdd = Array.from(files).slice(0, remaining)
    if (toAdd.length < files.length) {
      toast.warning(`Only ${remaining} slot${remaining === 1 ? '' : 's'} left — extra files skipped`)
    }

    const next: PhotoDraft[] = [...drafts]
    for (const file of toAdd) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`)
        continue
      }
      try {
        const blob = await compressImage(file)
        next.push({
          id: crypto.randomUUID(),
          blob,
          previewUrl: URL.createObjectURL(blob),
          fileName: file.name,
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to process ${file.name}`)
      }
    }
    onChange(next)
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeDraft(id: string) {
    const victim = drafts.find((d) => d.id === id)
    if (victim) URL.revokeObjectURL(victim.previewUrl)
    onChange(drafts.filter((d) => d.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {drafts.length}/{MAX_PHOTOS_PER_TASK} photos — compressed on upload
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || remaining <= 0}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          {remaining <= 0 ? 'Limit reached' : 'Add photos'}
        </Button>
      </div>

      {drafts.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {drafts.map((d) => (
            <div key={d.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
              <img src={d.previewUrl} alt={d.fileName} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeDraft(d.id)}
                disabled={disabled}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
