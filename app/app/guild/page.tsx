"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft, Search } from "lucide-react"

import { AppMessageBanner, createErrorMessage, createSuccessMessage, type AppMessage } from "@/components/app-message"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { PixelBoltSolid, PixelCodeSolid, PixelUsersCrownSolid, PixelUsersSolid } from "@/components/pixel-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { guildFeatureEnabled } from "@/lib/guild-config"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/types"

const GUILD_SYMBOL_OPTIONS = [".", "*", "+", "-", "~", "#", "@", "◇", "◆", "✦", "☾", "☀"]
const GUILD_NAME_PATTERN = /^[a-zA-Z0-9]+$/

type ProfileSummary = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "username" | "created_at">
type GuildRow = Database["public"]["Tables"]["guilds"]["Row"]
type GuildMembership = Database["public"]["Tables"]["guild_members"]["Row"] & {
  guilds?: GuildRow | GuildRow[] | null
}
type GuildListItem = Pick<GuildRow, "id" | "name" | "tag" | "symbol" | "owner_id" | "created_at"> & {
  memberCount: number
}

function getGuildRelation(value: GuildRow | GuildRow[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function getRemainingDays(createdAt: string) {
  const createdMs = new Date(createdAt).getTime()
  const eligibleMs = createdMs + 7 * 24 * 60 * 60 * 1000
  const diffMs = eligibleMs - Date.now()
  if (diffMs <= 0) return 0
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
}

export default function GuildIndexPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileSummary | null>(null)
  const [membership, setMembership] = useState<GuildMembership | null>(null)
  const [guildName, setGuildName] = useState("")
  const [guildTag, setGuildTag] = useState("")
  const [guildSymbol, setGuildSymbol] = useState(".")
  const [guildSearch, setGuildSearch] = useState("")
  const [guilds, setGuilds] = useState<GuildListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<AppMessage | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

      const fetchGuildList = async () => {
        const [guildsResult, membersResult] = await Promise.all([
          supabase.from("guilds").select("id, name, tag, symbol, owner_id, created_at").order("created_at", { ascending: false }).limit(50),
          supabase.from("guild_members").select("guild_id"),
        ])

        if (guildsResult.error || membersResult.error) {
          setMessage(createErrorMessage(guildsResult.error ?? membersResult.error ?? "ギルド一覧の取得に失敗しました。"))
          return
        }

        const memberCountMap = new Map<string, number>()
        for (const row of membersResult.data ?? []) {
          memberCountMap.set(row.guild_id, (memberCountMap.get(row.guild_id) ?? 0) + 1)
        }

        setGuilds(
          ((guildsResult.data ?? []) as Array<Pick<GuildRow, "id" | "name" | "tag" | "symbol" | "owner_id" | "created_at">>).map((guild) => ({
            ...guild,
            memberCount: memberCountMap.get(guild.id) ?? 0,
          })),
        )
      }

      const fetchData = async (authUser: User | null) => {
        setUser(authUser)
        await fetchGuildList()

        if (!authUser) {
          setProfile(null)
        setMembership(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      const [profileResult, membershipResult] = await Promise.all([
        supabase.from("profiles").select("id, username, created_at").eq("id", authUser.id).maybeSingle(),
        supabase.from("guild_members").select("user_id, guild_id, role, joined_at, guilds:guild_id(*)").eq("user_id", authUser.id).maybeSingle(),
      ])

      if (profileResult.error || membershipResult.error) {
        setMessage(createErrorMessage(profileResult.error ?? membershipResult.error ?? "ギルド情報の取得に失敗しました。"))
        setIsLoading(false)
        return
      }

      setProfile((profileResult.data ?? null) as ProfileSummary | null)
      setMembership((membershipResult.data ?? null) as GuildMembership | null)
      setIsLoading(false)
    }

    void supabase.auth.getUser().then(({ data }) => void fetchData(data.user))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void fetchData(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const currentGuild = getGuildRelation(membership?.guilds)
  const remainingDays = profile ? getRemainingDays(profile.created_at) : 0
  const canCreateGuild = Boolean(user && profile && !membership && remainingDays === 0)
  const filteredGuilds = useMemo(() => {
    const keyword = guildSearch.trim().toLowerCase()
    if (!keyword) return guilds
    return guilds.filter((guild) => {
      const haystack = `${guild.name} ${guild.tag} ${guild.symbol}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [guildSearch, guilds])

  const creationHint = useMemo(() => {
    if (!user) return "ギルドを作成するにはログインが必要です。"
    if (membership && currentGuild) return `すでに /guild/${currentGuild.name} に加入しています。`
    if (remainingDays > 0) return `登録から7日経過後に作成できます。あと ${remainingDays} 日です。`
    return "ギルドタグは5文字以内、ギルド名は英数字のみで設定します。"
  }, [currentGuild, membership, remainingDays, user])

  const handleCreateGuild = async () => {
    if (!canCreateGuild) {
      setMessage(createErrorMessage(creationHint))
      return
    }

    const trimmedTag = guildTag.trim()
    const normalizedName = guildName.trim().toLowerCase()

    if (!GUILD_NAME_PATTERN.test(normalizedName)) {
      setMessage(createErrorMessage("ギルド名は英数字のみで入力してください。"))
      return
    }

    if (trimmedTag.length === 0 || trimmedTag.length > 5) {
      setMessage(createErrorMessage("ギルドタグは1〜5文字で入力してください。"))
      return
    }

    setIsSubmitting(true)
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.rpc("create_guild", {
      p_name: normalizedName,
      p_tag: trimmedTag,
      p_symbol: guildSymbol,
    })
    setIsSubmitting(false)

    if (error || !data) {
      setMessage(createErrorMessage(error ?? "ギルドの作成に失敗しました。"))
      return
    }

    setMessage(createSuccessMessage("ギルドを作成しました。"))
    router.push(`/guild/${data}`)
  }

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(createErrorMessage(error))
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div>
              <p className="text-sm font-semibold">ギルド</p>
              <p className="text-xs text-muted-foreground">作成と参加の入口</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            {user ? <MobileUserMenu profileUsername={profile?.username ?? null} onSignOut={handleSignOut} /> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col pb-24">
        <AppMessageBanner message={message} className="px-3 pt-3 text-xs sm:px-4" />
        {!guildFeatureEnabled ? (
          <section className="px-3 py-10 sm:px-4">
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              ギルド機能は現在無効です。`guildconfig.json` で `guild: true` にするまで利用できません。
            </div>
          </section>
        ) : (
          <>

        <section className="border-b border-border/80 px-3 py-5 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">ギルドを作る</h1>
              <p className="mt-1 text-sm text-muted-foreground">タグと記号を決めて、自分たちの居場所を作れます。</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-muted-foreground">
              <PixelCodeSolid className="size-5" />
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{creationHint}</p>
        </section>

        <section className="border-b border-border/80 px-3 py-5 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">ギルドを探す</h2>
              <p className="mt-1 text-sm text-muted-foreground">公開されているギルドを見つけて、そのままページへ移動できます。</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-muted-foreground">
              <PixelUsersSolid className="size-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-background px-3">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={guildSearch}
              onChange={(event) => setGuildSearch(event.target.value)}
              placeholder="guild名 / タグ / 記号で検索"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="mt-4 space-y-3">
            {filteredGuilds.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">表示できるギルドはまだありません。</div>
            ) : (
              filteredGuilds.map((guild) => (
                <div key={guild.id} className="rounded-2xl border border-border/70 bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-200">
                        <PixelBoltSolid className="size-4" />
                        <span>{guild.tag}</span>
                        <span>{guild.symbol}</span>
                      </div>
                      <p className="mt-3 text-base font-semibold">/guild/{guild.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">メンバー {guild.memberCount} 人</p>
                    </div>
                    <div className="flex gap-2">
                      {currentGuild?.name === guild.name ? (
                        <Button asChild variant="outline">
                          <Link href={`/guild/${guild.name}/chat`}>
                            <PixelUsersCrownSolid className="size-4" />
                            チャット
                          </Link>
                        </Button>
                      ) : null}
                      <Button asChild>
                        <Link href={`/guild/${guild.name}`}>ページを見る</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {isLoading ? (
          <section className="px-3 py-6 text-sm text-muted-foreground sm:px-4">読み込み中...</section>
        ) : !user ? (
          <section className="px-3 py-6 sm:px-4">
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              ログインするとギルドの作成や参加ができます。
            </div>
          </section>
        ) : currentGuild ? (
          <section className="px-3 py-6 sm:px-4">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-medium">現在加入中のギルド</p>
              <p className="mt-2 text-lg font-semibold">{currentGuild.tag} {currentGuild.symbol}</p>
              <p className="mt-1 text-sm text-muted-foreground">/guild/{currentGuild.name}</p>
              <div className="mt-4">
                <Button asChild>
                  <Link href={`/guild/${currentGuild.name}`}>ギルドページを開く</Link>
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="px-3 py-6 sm:px-4">
            <div className="space-y-4 rounded-2xl border border-border/70 bg-background p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">ギルド名</p>
                <Input
                  value={guildName}
                  onChange={(event) => setGuildName(event.target.value.replace(/\s+/g, ""))}
                  maxLength={20}
                  placeholder="happy"
                />
                <p className="text-xs text-muted-foreground">公開 URL は /guild/{guildName.trim().toLowerCase() || "happy"} になります。</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">ギルドタグ</p>
                <Input value={guildTag} onChange={(event) => setGuildTag(event.target.value)} maxLength={5} placeholder="happy" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">記号</p>
                <Select value={guildSymbol} onValueChange={setGuildSymbol}>
                  <SelectTrigger>
                    <SelectValue placeholder="記号を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {GUILD_SYMBOL_OPTIONS.map((symbol) => (
                      <SelectItem key={symbol} value={symbol}>
                        {symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-3">
                <p className="text-xs text-muted-foreground">ネームタグの表示イメージ</p>
                <p className="mt-2 text-sm font-semibold">表示名 <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-200">{guildTag.trim() || "happy"} {guildSymbol}</span></p>
              </div>

              <Button onClick={handleCreateGuild} disabled={!canCreateGuild || isSubmitting}>
                {isSubmitting ? "作成中..." : "ギルドを作成"}
              </Button>
            </div>
          </section>
        )}
          </>
        )}
      </main>

      <MobileBottomNav userId={user?.id ?? null} profileUsername={profile?.username ?? null} />
    </div>
  )
}
