import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export async function deletePostWithMedia(postId: string) {
  const supabase = getSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error("投稿削除には再ログインが必要です。")
  }

  const response = await fetch(`/api/posts/${postId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const payload = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? "投稿削除に失敗しました。")
  }
}
