/**
 * Resize + re-encode an image client-side so we never send >1.5MB to the
 * edge function / Anthropic (their per-image limit is ~5MB and phone photos
 * blow past it). Returns a JPEG data URL.
 */
export function compressImage(
  file: File | Blob,
  opts: { maxDimension?: number; quality?: number } = {}
): Promise<string> {
  const { maxDimension = 1536, quality = 0.82 } = opts
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("Canvas no disponible"))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL("image/jpeg", quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("No se pudo cargar la imagen"))
    }
    img.src = url
  })
}

/** Compress a data URL (e.g. from a camera canvas) down to a safe size. */
export async function compressDataUrl(dataUrl: string): Promise<string> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return compressImage(blob)
}
