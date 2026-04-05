"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { AppMessageBanner, createErrorMessage, type AppMessage } from "@/components/app-message"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

function sanitizeNext(nextPath: string | null) {
  if (!nextPath) return "/connections"
  if (!nextPath.startsWith("/")) return "/connections"
  return nextPath
}

export function SpotifyCallbackClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState<AppMessage | null>(null)

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get("code")
      const error = searchParams.get("error")
      const nextPath = sanitizeNext(searchParams.get("state"))
      const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI

      if (error) {
        setMessage(createErrorMessage(`Spotify連携に失敗しました: ${error}`))
        return
      }

      if (!code) {
        setMessage(createErrorMessage("Spotify の認証コードが見つかりません。"))
        return
      }

      if (!redirectUri) {
        setMessage(createErrorMessage("NEXT_PUBLIC_SPOTIFY_REDIRECT_URI が設定されていません。"))
        return
      }

      const supabase = getSupabaseBrowserClient()
      const [{ data: sessionResult }, { data: userResult }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ])

      if (!sessionResult.session?.access_token || !userResult.user) {
        setMessage(createErrorMessage("Spotify を連携するには先にログインしてください。"))
        return
      }

      const response = await fetch("/api/connections/spotify/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionResult.session.access_token}`,
        },
        body: JSON.stringify({
          code,
          redirectUri,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        setMessage(createErrorMessage(payload?.error ?? "Spotify連携に失敗しました。"))
        return
      }

      router.replace(`${nextPath}?spotify=connected`)
    }

    void run()
  }, [router, searchParams])

  if (message) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <AppMessageBanner message={message} className="max-w-md" />
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">
      Spotify と接続しています...
    </div>
  )
}

