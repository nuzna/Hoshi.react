"use client"

const MAX_AVATAR_BYTES = 80 * 1024
const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
])
const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".heic", ".heif"]

type DrawableImage = HTMLImageElement | ImageBitmap

function isAcceptedImage(file: File) {
  if (ACCEPTED_TYPES.has(file.type)) {
    return true
  }

  const lowerName = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

async function loadImage(file: File): Promise<DrawableImage> {
  if (typeof window !== "undefined" && "createImageBitmap" in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fallback to HTMLImageElement below when ImageBitmap decoding is unavailable.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(
        new Error(
          "画像を読み込めませんでした。HEIC の場合は iPhone の共有設定や別画像でも試してください。"
        )
      )
    }

    image.src = url
  })
}

function getImageSize(image: DrawableImage) {
  if ("naturalWidth" in image) {
    return { width: image.naturalWidth, height: image.naturalHeight }
  }

  return { width: image.width, height: image.height }
}

function closeImageIfNeeded(image: DrawableImage) {
  if ("close" in image && typeof image.close === "function") {
    image.close()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("画像の変換に失敗しました。"))
          return
        }
        resolve(blob)
      },
      "image/webp",
      quality,
    )
  })
}

export async function prepareAvatarUpload(file: File): Promise<File> {
  if (!isAcceptedImage(file)) {
    throw new Error("アイコン画像は PNG / JPG / HEIC / HEIF のみアップロードできます。")
  }

  const image = await loadImage(file)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    closeImageIfNeeded(image)
    throw new Error("画像処理に必要な Canvas が利用できません。")
  }

  const imageSize = getImageSize(image)
  let width = imageSize.width
  let height = imageSize.height
  const longestSide = Math.max(width, height)

  if (longestSide > 512) {
    const scale = 512 / longestSide
    width = Math.max(1, Math.round(width * scale))
    height = Math.max(1, Math.round(height * scale))
  }

  const qualities = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5, 0.44]

  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = width
      canvas.height = height
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, quality)
        if (blob.size <= MAX_AVATAR_BYTES) {
          return new File([blob], `${file.name.replace(/\.(png|jpe?g|heic|heif)$/i, "")}.webp`, {
            type: "image/webp",
          })
        }
      }

      width = Math.max(96, Math.round(width * 0.82))
      height = Math.max(96, Math.round(height * 0.82))
    }
  } finally {
    closeImageIfNeeded(image)
  }

  throw new Error("画像を 80KB 以下に圧縮できませんでした。別の画像で試してください。")
}
