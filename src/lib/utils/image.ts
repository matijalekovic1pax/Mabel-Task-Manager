// Canvas-based image compression. No dependency; resizes to a max edge and
// re-encodes as JPEG at the given quality. Heavy compression is deliberate —
// storage is the scarce resource, not fidelity.

export type CompressOptions = {
  maxEdge?: number   // longest edge in px (default 1600)
  quality?: number   // JPEG quality 0..1 (default 0.7)
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<Blob> {
  const maxEdge = opts.maxEdge ?? 1600
  const quality = opts.quality ?? 0.7

  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)

  const { width, height } = scaledDimensions(img.width, img.height, maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
  if (!blob) throw new Error('Failed to encode image')
  return blob
}

function scaledDimensions(w: number, h: number, maxEdge: number) {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h }
  const ratio = w > h ? maxEdge / w : maxEdge / h
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}
