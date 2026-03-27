export const POST_IMAGE_MAX_COUNT = 4
export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const POST_IMAGE_ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

export type PendingPostImage = {
  file: File
  previewUrl: string
  width: number | null
  height: number | null
}

async function loadImageDimensions(file: File) {
  if (typeof window !== "undefined" && "createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file)
      const dimensions = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dimensions
    } catch {
      // Fall back to HTMLImageElement.
    }
  }

  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(dimensions)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("画像サイズの取得に失敗しました。"))
    }

    image.src = url
  })
}

export async function preparePostImageSelection(
  files: FileList | File[],
  existingCount = 0,
): Promise<PendingPostImage[]> {
  const nextFiles = Array.from(files)

  if (existingCount + nextFiles.length > POST_IMAGE_MAX_COUNT) {
    throw new Error(`画像は1投稿につき${POST_IMAGE_MAX_COUNT}枚までです。`)
  }

  const prepared = await Promise.all(
    nextFiles.map(async (file) => {
      if (!POST_IMAGE_ACCEPTED_TYPES.has(file.type)) {
        throw new Error("投稿画像は PNG / JPG / WebP / GIF のみ対応しています。")
      }

      if (file.size > POST_IMAGE_MAX_BYTES) {
        throw new Error("画像は1枚あたり10MB以下にしてください。")
      }

      const dimensions = await loadImageDimensions(file)
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        width: dimensions.width,
        height: dimensions.height,
      } satisfies PendingPostImage
    }),
  )

  return prepared
}

export function revokePendingPostImages(images: PendingPostImage[]) {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl)
  }
}
