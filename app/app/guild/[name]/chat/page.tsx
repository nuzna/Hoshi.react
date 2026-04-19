"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft } from "lucide-react"

import { AppMessageBanner, createErrorMessage, type AppMessage } from "@/components/app-message"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { PixelMessageDotsSolid } from "@/components/pixel-icons"
import { ProfileDisplayName } from "@/components/profile-display-name"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { guildFeatureEnabled } from "@/lib/guild-config"
import { fetchCurrentUserGuild, getSingleGuild, type GuildMemberProfile, type GuildMembershipWithGuild, type GuildSummary } from "@/lib/guilds"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/types"

type GuildMessageRow = Database["public"]["Tables"]["guild_messages"]["Row"] & {
  profiles?: GuildMemberProfile | GuildMemberProfile[] | null
}

function getSingleProfile(value: GuildMemberProfile | GuildMemberProfile[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function GuildChatPageContent() {
  const params = useParams<{ name: string }>()
  const router = useRouter()
  const guildName = (params?.name ?? "").toLowerCase()

  const [user, setUser] = useState<User | null>(null)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [guild, setGuild] = useState<GuildSummary | null>(null)
  const [currentMembership, setCurrentMembership] = useState<GuildMembershipWithGuild | null>(null)
  const [messages, setMessages] = useState<GuildMessageRow[]>([])
  const [messageText, setMessageText] = useState("")
  const [message, setMessage] = useState<AppMessage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)

  const fetchChatPage = useCallback(async (authUser: User | null) => {
    if (!guildName) return

    const supabase = getSupabaseBrowserClient()
    setIsLoading(true)

    const guildResult = await supabase.from("guilds").select("id, name, tag, symbol, owner_id, created_at").eq("name", guildName).maybeSingle()
    if (guildResult.error) {
      setMessage(createErrorMessage(guildResult.error))
      setGuild(null)
      setMessages([])
      setIsLoading(false)
      return
    }

    const nextGuild = (guildResult.data ?? null) as GuildSummary | null
    setGuild(nextGuild)

    if (!nextGuild || !authUser) {
      setCurrentMembership(null)
      setMessages([])
      setIsLoading(false)
      return
    }

    const [profileResult, membershipResult] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", authUser.id).maybeSingle(),
      fetchCurrentUserGuild(supabase, authUser.id),
    ])

    if (profileResult.error) {
      setMessage(createErrorMessage(profileResult.error))
      setIsLoading(false)
      return
    }

    setProfileUsername(profileResult.data?.username ?? null)
    setCurrentMembership(membershipResult)

    if (membershipResult?.guild_id !== nextGuild.id) {
      setMessages([])
      setIsLoading(false)
      return
    }

    const messagesResult = await supabase
      .from("guild_messages")
      .select("id, guild_id, user_id, content, created_at, profiles:user_id(id, username, display_name, avatar_url, display_font)")
      .eq("guild_id", nextGuild.id)
      .order("created_at", { ascending: true })
      .limit(200)

    if (messagesResult.error) {
      setMessage(createErrorMessage(messagesResult.error))
      setIsLoading(false)
      return
    }

    setMessages((messagesResult.data ?? []) as GuildMessageRow[])
    setIsLoading(false)
  }, [guildName])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      void fetchChatPage(data.user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      void fetchChatPage(nextUser)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchChatPage])

  useEffect(() => {
    if (!guild || currentMembership?.guild_id !== guild.id) return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`guild-chat-${guild.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "guild_messages", filter: `guild_id=eq.${guild.id}` }, () => void fetchChatPage(user))
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [currentMembership, fetchChatPage, guild, user])

  const isMemberOfThisGuild = guild && currentMembership?.guild_id === guild.id
  const currentGuild = getSingleGuild(currentMembership?.guilds)

  const handleSendMessage = async () => {
    if (!guild || !user || !isMemberOfThisGuild) return
    if (!messageText.trim()) {
      setMessage(createErrorMessage("メッセージを入力してください。"))
      return
    }

    setIsSending(true)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from("guild_messages").insert({
      guild_id: guild.id,
      user_id: user.id,
      content: messageText.trim(),
    })
    setIsSending(false)

    if (error) {
      setMessage(createErrorMessage(error))
      return
    }

    setMessageText("")
  }

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(createErrorMessage(error))
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <p className="text-sm font-semibold">ギルドチャット</p>
              <p className="text-xs text-muted-foreground">/guild/{guildName || "..."}/chat</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {guild ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/guild/${guild.name}`}>ギルドへ戻る</Link>
              </Button>
            ) : null}
            <ModeToggle />
            {user ? <MobileUserMenu profileUsername={profileUsername} onSignOut={handleSignOut} /> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col pb-24">
        <AppMessageBanner message={message} className="px-3 pt-3 text-xs sm:px-4" />
        {!guildFeatureEnabled ? (
          <section className="px-3 py-10 sm:px-4">
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              ギルド機能は現在無効です。`guildconfig.json` で `guild: true` にするまで利用できません。
            </div>
          </section>
        ) : (
          <>

        {isLoading ? (
          <section className="px-3 py-6 text-sm text-muted-foreground sm:px-4">読み込み中...</section>
        ) : !guild ? (
          <section className="px-3 py-10 sm:px-4"><div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">ギルドは見つかりませんでした。</div></section>
        ) : !user ? (
          <section className="px-3 py-10 sm:px-4"><div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">チャットを見るにはログインが必要です。</div></section>
        ) : !isMemberOfThisGuild ? (
          <section className="px-3 py-10 sm:px-4">
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {currentGuild ? `現在 /guild/${currentGuild.name} に加入中です。このギルドのチャットは見られません。` : "チャットは加入メンバーのみ利用できます。"}
            </div>
          </section>
        ) : (
          <section className="px-3 py-5 sm:px-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <PixelMessageDotsSolid className="size-4 text-muted-foreground" />
              {guild.tag} {guild.symbol} のチャット
            </div>
            <div className="space-y-4">
              <div className="max-h-[34rem] space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-muted/15 p-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">まだメッセージはありません。</p>
                ) : (
                  messages.map((entry) => {
                    const author = getSingleProfile(entry.profiles)
                    return (
                      <div key={entry.id} className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <ProfileDisplayName
                            name={author?.display_name ?? "名無し"}
                            font={author?.display_font}
                            guildTag={guild.tag}
                            guildSymbol={guild.symbol}
                            textClassName="font-medium"
                          />
                          <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("ja-JP")}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="space-y-2 rounded-2xl border border-border/70 bg-background p-3">
                <Textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="ギルドにメッセージを送る"
                  maxLength={500}
                  className="min-h-24"
                />
                <Button onClick={handleSendMessage} disabled={isSending}>
                  {isSending ? "送信中..." : "送信"}
                </Button>
              </div>
            </div>
          </section>
        )}
          </>
        )}
      </main>

      <MobileBottomNav userId={user?.id ?? null} profileUsername={profileUsername} />
    </div>
  )
}

export default function GuildChatPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">ギルドチャットを読み込み中...</div>}>
      <GuildChatPageContent />
    </Suspense>
  )
}
