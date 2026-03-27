import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { PendingPostImage } from "@/lib/post-image"

export type UploadedPostImage = {
  url: string
  fileName: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  sortOrder: number
}

export async function uploadPostImagesToB2(images: PendingPostImage[]) {
  if (images.length === 0) {
    return [] as UploadedPostImage[]
  }

  const supabase = getSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error("画像アップロードには再ログインが必要です。")
  }

  const uploaded = await Promise.all(
    images.map(async (image, index) => {
      const formData = new FormData()
      formData.append("file", image.file)

      const response = await fetch("/api/post-images/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      const payload = (await response.json()) as
        | { error: string }
        | { url: string; fileName: string; mimeType: string; sizeBytes: number }

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "画像アップロードに失敗しました。")
      }

      return {
        url: payload.url,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        width: image.width,
        height: image.height,
        sortOrder: index,
      } satisfies UploadedPostImage
    }),
  )

  return uploaded
}
