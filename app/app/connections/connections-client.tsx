"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft, Link2, LogOut, RefreshCw, Unplug } from "lucide-react"

import {
  AppMessageBanner,
  createErrorMessage,
  createInfoMessage,
  createSuccessMessage,
  type AppMessage,
} from "@/components/app-message"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { SpotifyWidget } from "@/components/spotify-widget"
import { Button } from "@/components/ui/button"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/types"

type ConnectionProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "avatar_url" | "discord_id" | "discord_username" | "discord_avatar_url"
>

type SpotifyConnection = Database["public"]["Tables"]["spotify_connections"]["Row"]
type SpotifyPresence = Database["public"]["Tables"]["spotify_presence_cache"]["Row"]

function getSpotifyAuthUrl() {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
  const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI

  if (!clientId) {
    throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID が設定されていません。")
  }

  if (!redirectUri) {
    throw new Error("NEXT_PUBLIC_SPOTIFY_REDIRECT_URI が設定されていません。")
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "user-read-currently-playing user-read-recently-played",
    state: "/connections",
    show_dialog: "true",
  })

  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export function ConnectionsClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ConnectionProfile | null>(null)
  const [spotifyConnection, setSpotifyConnection] = useState<SpotifyConnection | null>(null)
  const [spotifyPresence, setSpotifyPresence] = useState<SpotifyPresence | null>(null)
  const [message, setMessage] = useState<AppMessage | null>(() =>
    searchParams.get("spotify") === "connected" ? createSuccessMessage("Spotify を接続しました。") : null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncingSpotify, setIsSyncingSpotify] = useState(false)
  const [isDisconnectingSpotify, setIsDisconnectingSpotify] = useState(false)
  const [isDisconnectingDiscord, setIsDisconnectingDiscord] = useState(false)

  useEffect(() => {
    if (searchParams.get("spotify") === "connected") {
      router.replace("/connections")
    }
  }, [router, searchParams])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    const fetchData = async (authUser: User | null) => {
      if (!authUser) {
        setProfile(null)
        setSpotifyConnection(null)
        setSpotifyPresence(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      const [profileResult, spotifyResult, presenceResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, discord_id, discord_username, discord_avatar_url")
          .eq("id", authUser.id)
          .maybeSingle(),
        supabase.from("spotify_connections").select("*").eq("user_id", authUser.id).maybeSingle(),
        supabase.from("spotify_presence_cache").select("*").eq("user_id", authUser.id).maybeSingle(),
      ])

      if (profileResult.error || spotifyResult.error || presenceResult.error) {
        setMessage(
          createErrorMessage(
            profileResult.error?.message ??
              spotifyResult.error?.message ??
              presenceResult.error?.message ??
              "接続情報の読み込みに失敗しました。",
          ),
        )
        setIsLoading(false)
        return
      }

      setProfile((profileResult.data ?? null) as ConnectionProfile | null)
      setSpotifyConnection((spotifyResult.data ?? null) as SpotifyConnection | null)
      setSpotifyPresence((presenceResult.data ?? null) as SpotifyPresence | null)
      setIsLoading(false)
    }

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      void fetchData(data.user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null
      setUser(authUser)
      void fetchData(authUser)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const getSessionAccessToken = async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  const handleConnectSpotify = () => {
    try {
      window.location.assign(getSpotifyAuthUrl())
    } catch (error) {
      setMessage(createErrorMessage(error))
    }
  }

  const handleSyncSpotify = async () => {
    const accessToken = await getSessionAccessToken()
    if (!accessToken) {
      setMessage(createErrorMessage("Spotify を同期するにはログインが必要です。"))
      return
    }

    setIsSyncingSpotify(true)
    const response = await fetch("/api/connections/spotify/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const payload = (await response.json().catch(() => null)) as { error?: string } | SpotifyPresence | null
    setIsSyncingSpotify(false)

    if (!response.ok) {
      setMessage(createErrorMessage(payload && "error" in payload ? payload.error : "Spotify の同期に失敗しました。"))
      return
    }

    setSpotifyPresence(payload as SpotifyPresence)
    setMessage(createSuccessMessage("Spotify を同期しました。"))
  }

  const handleDisconnectSpotify = async () => {
    const accessToken = await getSessionAccessToken()
    if (!accessToken) {
      setMessage(createErrorMessage("Spotify を解除するにはログインが必要です。"))
      return
    }

    setIsDisconnectingSpotify(true)
    const response = await fetch("/api/connections/spotify/disconnect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    setIsDisconnectingSpotify(false)

    if (!response.ok) {
      setMessage(createErrorMessage(payload?.error ?? "Spotify の解除に失敗しました。"))
      return
    }

    setSpotifyConnection(null)
    setSpotifyPresence(null)
    setMessage(createSuccessMessage("Spotify の接続を解除しました。"))
  }

  const handleDisconnectDiscord = async () => {
    if (!profile) return

    setIsDisconnectingDiscord(true)
    const supabase = getSupabaseBrowserClient()
    const nextAvatarUrl =
      profile.avatar_url && profile.avatar_url === profile.discord_avatar_url ? null : profile.avatar_url

    const { error } = await supabase
      .from("profiles")
      .update({
        discord_id: null,
        discord_username: null,
        discord_avatar_url: null,
        avatar_url: nextAvatarUrl,
      })
      .eq("id", profile.id)

    setIsDisconnectingDiscord(false)

    if (error) {
      setMessage(createErrorMessage(error))
      return
    }

    setProfile((current) =>
      current
        ? {
            ...current,
            discord_id: null,
            discord_username: null,
            discord_avatar_url: null,
            avatar_url: nextAvatarUrl,
          }
        : current,
    )
    setMessage(createInfoMessage("Discord の表示情報を解除しました。次回 Discord ログイン時に再同期されます。"))
  }

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(createErrorMessage(error))
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-[680px] px-5 pb-24 pt-4 sm:px-6">
        <header className="mb-2 flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={profile ? `/user/${profile.username}` : "/"}>
                <ArrowLeft className="size-4" />
                戻る
              </Link>
            </Button>
            <h1 className="text-lg font-semibold">接続</h1>
          </div>

          {user ? (
            <>
              <div className="sm:hidden">
                <MobileUserMenu profileUsername={profile?.username ?? null} onSignOut={handleSignOut} />
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <ModeToggle />
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  <span>ログアウト</span>
                </Button>
              </div>
            </>
          ) : (
            <div className="hidden sm:block">
              <ModeToggle />
            </div>
          )}
        </header>

        <AppMessageBanner message={message} className="mb-3" />

        {!user ? (
          <div className="border-b border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            接続設定を開くにはログインしてください。
          </div>
        ) : isLoading ? (
          <div className="border-b border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            接続情報を読み込んでいます...
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-3xl border border-border/80 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Discord</p>
                  <p className="text-xs text-muted-foreground">
                    ユーザー名とアイコンは表示できます。オンライン状態とアクティビティは Discord OAuth の仕様上取得できません。
                  </p>
                </div>
                <span className="rounded-full border border-border/70 px-2 py-1 text-xs">
                  {profile?.discord_id ? "接続済み" : "未接続"}
                </span>
              </div>

              {profile?.discord_id ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center gap-3">
                    {profile.discord_avatar_url ? (
                      <Image
                        src={profile.discord_avatar_url}
                        alt="Discord アイコン"
                        width={44}
                        height={44}
                        className="size-11 rounded-full border border-border/70 object-cover"
                      />
                    ) : null}
                    <div>
                      <p className="text-sm font-medium">{profile.discord_username ?? "Discord user"}</p>
                      <p className="text-xs text-muted-foreground">ログイン連携中</p>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" onClick={handleDisconnectDiscord} disabled={isDisconnectingDiscord}>
                    <Unplug className="size-4" />
                    {isDisconnectingDiscord ? "解除中..." : "表示情報を解除"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Discord でログインすると、ユーザー名とアイコンがプロフィールに同期されます。
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-border/80 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Spotify</p>
                  <p className="text-xs text-muted-foreground">
                    現在再生中の曲、再生していない場合は最後に再生した曲をプロフィールに表示します。
                  </p>
                </div>
                <span className="rounded-full border border-border/70 px-2 py-1 text-xs">
                  {spotifyConnection ? "接続済み" : "未接続"}
                </span>
              </div>

              {spotifyPresence ? (
                <div className="mb-3">
                  <SpotifyWidget presence={spotifyPresence} compact />
                </div>
              ) : null}

              {spotifyConnection ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleSyncSpotify} disabled={isSyncingSpotify}>
                    <RefreshCw className="size-4" />
                    {isSyncingSpotify ? "同期中..." : "今の再生状態を更新"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnectSpotify}
                    disabled={isDisconnectingSpotify}
                  >
                    <Unplug className="size-4" />
                    {isDisconnectingSpotify ? "解除中..." : "接続解除"}
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={handleConnectSpotify}>
                  <Link2 className="size-4" />
                  Spotify を接続
                </Button>
              )}
            </section>
          </div>
        )}
      </main>

      <MobileBottomNav userId={user?.id ?? null} profileUsername={profile?.username ?? null} />
    </div>
  )
}

