"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft, LogOut, RefreshCw, Unplug } from "lucide-react"

import { ApexWidget } from "@/components/apex-widget"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/types"

type ConnectionProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "avatar_url" | "discord_id" | "discord_username" | "discord_avatar_url"
>

type ApexConnection = Database["public"]["Tables"]["apex_connections"]["Row"]
type ApexProfileCache = Database["public"]["Tables"]["apex_profile_cache"]["Row"]

const apexPlatformLabels: Record<"PC" | "PS4" | "SWICH" | "X1", string> = {
  PC: "PC",
  PS4: "PlayStation",
  SWICH: "Nintendo Switch",
  X1: "Xbox",
}

export function ConnectionsClient() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ConnectionProfile | null>(null)
  const [message, setMessage] = useState<AppMessage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isDisconnectingDiscord, setIsDisconnectingDiscord] = useState(false)
  const [apexConnection, setApexConnection] = useState<ApexConnection | null>(null)
  const [apexProfile, setApexProfile] = useState<ApexProfileCache | null>(null)
  const [apexPlatform, setApexPlatform] = useState<"PC" | "PS4" | "SWICH" | "X1">("PC")
  const [apexPlayerName, setApexPlayerName] = useState("")
  const [isSyncingApex, setIsSyncingApex] = useState(false)
  const [isDisconnectingApex, setIsDisconnectingApex] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    const fetchData = async (authUser: User | null) => {
      if (!authUser) {
        setProfile(null)
        setApexConnection(null)
        setApexProfile(null)
        setIsAdmin(false)
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      const [profileResult, adminResult, apexConnectionResult, apexProfileResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, discord_id, discord_username, discord_avatar_url")
          .eq("id", authUser.id)
          .maybeSingle(),
        supabase.rpc("is_current_user_admin"),
        supabase.from("apex_connections").select("*").eq("user_id", authUser.id).maybeSingle(),
        supabase.from("apex_profile_cache").select("*").eq("user_id", authUser.id).maybeSingle(),
      ])

      if (profileResult.error || adminResult.error || apexConnectionResult.error || apexProfileResult.error) {
        setMessage(
          createErrorMessage(
            profileResult.error?.message ??
              adminResult.error?.message ??
              apexConnectionResult.error?.message ??
              apexProfileResult.error?.message ??
              "接続情報の読み込みに失敗しました。",
          ),
        )
        setIsLoading(false)
        return
      }

      const nextApexConnection = (apexConnectionResult.data ?? null) as ApexConnection | null
      const nextApexProfile = (apexProfileResult.data ?? null) as ApexProfileCache | null

      setProfile((profileResult.data ?? null) as ConnectionProfile | null)
      setIsAdmin(Boolean(adminResult.data))
      setApexConnection(nextApexConnection)
      setApexProfile(nextApexProfile)

      if (nextApexConnection) {
        setApexPlatform((nextApexConnection.platform as "PC" | "PS4" | "SWICH" | "X1") ?? "PC")
        setApexPlayerName(nextApexConnection.player_name)
      } else {
        setApexPlatform("PC")
        setApexPlayerName("")
      }

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

  const handleSyncApex = async () => {
    const accessToken = await getSessionAccessToken()
    if (!accessToken) {
      setMessage(createErrorMessage("Apex を同期するにはログインが必要です。"))
      return
    }

    if (!apexPlayerName.trim()) {
      setMessage(createErrorMessage("Apex のプレイヤー名を入力してください。"))
      return
    }

    setIsSyncingApex(true)
    const response = await fetch("/api/connections/apex/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        platform: apexPlatform,
        playerName: apexPlayerName.trim(),
      }),
    })

    const payload = (await response.json().catch(() => null)) as ({ error?: string } & Partial<ApexProfileCache>) | null
    setIsSyncingApex(false)

    if (!response.ok || !payload || "error" in payload) {
      setMessage(createErrorMessage(payload?.error ?? "Apex 情報の同期に失敗しました。"))
      return
    }

    setApexConnection({
      user_id: user?.id ?? "",
      platform: payload.platform ?? apexPlatform,
      player_name: payload.player_name ?? apexPlayerName.trim(),
      created_at: apexConnection?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    setApexProfile(payload as ApexProfileCache)
    setApexPlatform((payload.platform as "PC" | "PS4" | "SWICH" | "X1") ?? apexPlatform)
    setApexPlayerName(payload.player_name ?? apexPlayerName.trim())
    setMessage(createSuccessMessage("Apex 情報を同期しました。"))
  }

  const handleDisconnectApex = async () => {
    const accessToken = await getSessionAccessToken()
    if (!accessToken) {
      setMessage(createErrorMessage("Apex 接続を解除するにはログインが必要です。"))
      return
    }

    setIsDisconnectingApex(true)
    const response = await fetch("/api/connections/apex/disconnect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    setIsDisconnectingApex(false)

    if (!response.ok) {
      setMessage(createErrorMessage(payload?.error ?? "Apex 接続の解除に失敗しました。"))
      return
    }

    setApexConnection(null)
    setApexProfile(null)
    setApexPlatform("PC")
    setApexPlayerName("")
    setMessage(createSuccessMessage("Apex 接続を解除しました。"))
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

            {isAdmin ? (
              <section className="rounded-3xl border border-border/80 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                  <p className="text-sm font-semibold">Apex Legends</p>
                  <p className="text-xs text-muted-foreground">
                      ALS からレベル、ランク、レジェンド、戦績を同期してプロフィールに表示します。
                  </p>
                </div>
                  <span className="rounded-full border border-border/70 px-2 py-1 text-xs">
                    {apexConnection ? "接続済み" : "未接続"}
                  </span>
                </div>

                {apexProfile ? (
                  <div className="mb-3">
                    <ApexWidget profile={apexProfile} compact />
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">プラットフォーム</p>
                    <Select value={apexPlatform} onValueChange={(value) => setApexPlatform(value as "PC" | "PS4" | "SWICH" | "X1")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PC">{apexPlatformLabels.PC}</SelectItem>
                        <SelectItem value="PS4">{apexPlatformLabels.PS4}</SelectItem>
                        <SelectItem value="SWICH">{apexPlatformLabels.SWICH}</SelectItem>
                        <SelectItem value="X1">{apexPlatformLabels.X1}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">プレイヤー名</p>
                    <Input
                      value={apexPlayerName}
                      onChange={(event) => setApexPlayerName(event.target.value)}
                      placeholder={apexPlatform === "PC" ? "PC のプレイヤー名" : "ALS に表示されるプレイヤー名"}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleSyncApex} disabled={isSyncingApex}>
                    <RefreshCw className="size-4" />
                    {isSyncingApex ? "同期中..." : apexConnection ? "接続情報を更新" : "保存して同期"}
                  </Button>

                  {apexConnection ? (
                    <Button variant="outline" size="sm" onClick={handleDisconnectApex} disabled={isDisconnectingApex}>
                      <Unplug className="size-4" />
                      {isDisconnectingApex ? "解除中..." : "接続解除"}
                    </Button>
                  ) : null}
                </div>

                <div className="mt-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                  審査中の実験機能です。Tracker 側の権限やプロフィール公開状態によって同期に失敗することがあります。
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>

      <MobileBottomNav userId={user?.id ?? null} profileUsername={profile?.username ?? null} />
    </div>
  )
}
