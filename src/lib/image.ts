/**
 * Resize + re-encode an image client-side so we never send >1.5MB to the
 * edge function / Anthropic (their per-image limit is ~5MB and phone photos
 * blow past it). Returns a data URL (WebP if supported, JPEG fallback).
 *
 * NOTE: The return shape MUST stay a `data:image/...;base64,...` string —
 * callers forward it as `image_base64` to the `ai-analyze-food` edge
 * function which strips the prefix.
 */
export function compressImage(
  file: File | Blob,
  opts: { maxDimension?: number; webpQuality?: number; jpegQuality?: number } = {}
): Promise<string> {
  const { maxDimension = 1280, webpQuality = 0.72, jpegQuality = 0.78 } = opts
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

      const blobToDataUrl = (blob: Blob) =>
        new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result as string)
          reader.onerror = () => rej(new Error("No se pudo leer la imagen"))
          reader.readAsDataURL(blob)
        })

      // Try WebP first, fall back to JPEG.
      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob && webpBlob.type === "image/webp") {
            blobToDataUrl(webpBlob).then(resolve, reject)
            return
          }
          canvas.toBlob(
            (jpegBlob) => {
              if (!jpegBlob) {
                // Last-ditch fallback.
                resolve(canvas.toDataURL("image/jpeg", jpegQuality))
                return
              }
              blobToDataUrl(jpegBlob).then(resolve, reject)
            },
            "image/jpeg",
            jpegQuality
          )
        },
        "image/webp",
        webpQuality
      )
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
