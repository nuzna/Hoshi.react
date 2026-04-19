"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft, Check, X } from "lucide-react"

import { AppMessageBanner, createErrorMessage, createSuccessMessage, type AppMessage } from "@/components/app-message"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { PixelCodeSolid, PixelMessageDotsSolid, PixelUsersCrownSolid, PixelUsersSolid } from "@/components/pixel-icons"
import { ProfileDisplayName } from "@/components/profile-display-name"
import { Button } from "@/components/ui/button"
import { guildFeatureEnabled } from "@/lib/guild-config"
import { fetchCurrentUserGuild, getSingleGuild, type GuildJoinRequestRow, type GuildMemberProfile, type GuildMemberRow, type GuildMembershipWithGuild, type GuildSummary } from "@/lib/guilds"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

function getSingleProfile(value: GuildMemberProfile | GuildMemberProfile[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

type MemberWithProfile = GuildMemberRow & {
  profiles?: GuildMemberProfile | GuildMemberProfile[] | null
}

function GuildDetailPageContent() {
  const params = useParams<{ name: string }>()
  const router = useRouter()
  const guildName = (params?.name ?? "").toLowerCase()

  const [user, setUser] = useState<User | null>(null)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [guild, setGuild] = useState<GuildSummary | null>(null)
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [pendingRequests, setPendingRequests] = useState<GuildJoinRequestRow[]>([])
  const [currentMembership, setCurrentMembership] = useState<GuildMembershipWithGuild | null>(null)
  const [myPendingRequest, setMyPendingRequest] = useState<GuildJoinRequestRow | null>(null)
  const [message, setMessage] = useState<AppMessage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isJoining, setIsJoining] = useState(false)
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null)

  const fetchGuildPage = useCallback(async (authUser: User | null) => {
    if (!guildName) return

    const supabase = getSupabaseBrowserClient()
    setIsLoading(true)

    const guildResult = await supabase.from("guilds").select("id, name, tag, symbol, owner_id, created_at").eq("name", guildName).maybeSingle()
    if (guildResult.error) {
      setMessage(createErrorMessage(guildResult.error))
      setGuild(null)
      setMembers([])
      setPendingRequests([])
      setMyPendingRequest(null)
      setIsLoading(false)
      return
    }

    const nextGuild = (guildResult.data ?? null) as GuildSummary | null
    setGuild(nextGuild)

    if (!nextGuild) {
      setMembers([])
      setPendingRequests([])
      setMyPendingRequest(null)
      setIsLoading(false)
      return
    }

    const membersResult = await supabase
      .from("guild_members")
      .select("user_id, guild_id, role, joined_at, profiles:user_id(id, username, display_name, avatar_url, display_font)")
      .eq("guild_id", nextGuild.id)
      .order("joined_at", { ascending: true })

    if (membersResult.error) {
      setMessage(createErrorMessage(membersResult.error))
      setIsLoading(false)
      return
    }

    setMembers((membersResult.data ?? []) as MemberWithProfile[])

    if (!authUser) {
      setCurrentMembership(null)
      setMyPendingRequest(null)
      setPendingRequests([])
      setIsLoading(false)
      return
    }

    const [profileResult, membershipResult, myRequestResult] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", authUser.id).maybeSingle(),
      fetchCurrentUserGuild(supabase, authUser.id),
      supabase
        .from("guild_join_requests")
        .select("id, guild_id, user_id, status, created_at, reviewed_at, reviewed_by")
        .eq("guild_id", nextGuild.id)
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (profileResult.error || myRequestResult.error) {
      setMessage(createErrorMessage(profileResult.error ?? myRequestResult.error ?? "ギルド情報の取得に失敗しました。"))
      setIsLoading(false)
      return
    }

    setProfileUsername(profileResult.data?.username ?? null)
    setCurrentMembership(membershipResult)

    const isMemberOfThisGuild = membershipResult?.guild_id === nextGuild.id
    setMyPendingRequest(isMemberOfThisGuild ? null : ((myRequestResult.data ?? null) as GuildJoinRequestRow | null))

    if (!isMemberOfThisGuild || !membershipResult || !["owner", "admin"].includes(membershipResult.role)) {
      setPendingRequests([])
      setIsLoading(false)
      return
    }

    const requestsResult = await supabase
      .from("guild_join_requests")
      .select("id, guild_id, user_id, status, created_at, reviewed_at, reviewed_by")
      .eq("guild_id", nextGuild.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })

    if (requestsResult.error) {
      setMessage(createErrorMessage(requestsResult.error))
      setIsLoading(false)
      return
    }

    const requestRows = (requestsResult.data ?? []) as GuildJoinRequestRow[]
    const requestUserIds = Array.from(new Set(requestRows.map((request) => request.user_id)))
    const requestProfilesResult = requestUserIds.length
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, display_font")
          .in("id", requestUserIds)
      : { data: [], error: null }

    if (requestProfilesResult.error) {
      setMessage(createErrorMessage(requestProfilesResult.error))
      setIsLoading(false)
      return
    }

    const profileMap = new Map(
      ((requestProfilesResult.data ?? []) as GuildMemberProfile[]).map((profile) => [profile.id, profile]),
    )

    setPendingRequests(
      requestRows.map((request) => ({
        ...request,
        profiles: profileMap.get(request.user_id) ?? null,
      })),
    )
    setIsLoading(false)
  }, [guildName])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      void fetchGuildPage(data.user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      void fetchGuildPage(nextUser)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchGuildPage])

  useEffect(() => {
    if (!guild) return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`guild-page-${guild.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "guild_members", filter: `guild_id=eq.${guild.id}` }, () => void fetchGuildPage(user))
      .on("postgres_changes", { event: "*", schema: "public", table: "guild_join_requests", filter: `guild_id=eq.${guild.id}` }, () => void fetchGuildPage(user))
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchGuildPage, guild, user])

  const isMemberOfThisGuild = guild && currentMembership?.guild_id === guild.id
  const isManager = isMemberOfThisGuild && currentMembership && ["owner", "admin"].includes(currentMembership.role)
  const currentGuild = getSingleGuild(currentMembership?.guilds)
  const belongsToDifferentGuild = Boolean(currentMembership && guild && currentMembership.guild_id !== guild.id)

  const handleJoinRequest = async () => {
    if (!guild) return
    if (!user) {
      setMessage(createErrorMessage("ログインが必要です。"))
      return
    }

    setIsJoining(true)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc("request_join_guild", { p_guild_id: guild.id })
    setIsJoining(false)

    if (error) {
      setMessage(createErrorMessage(error))
      return
    }

    setMessage(createSuccessMessage("参加申請を送りました。"))
    void fetchGuildPage(user)
  }

  const handleReviewRequest = async (requestId: string, decision: "approve" | "reject") => {
    setProcessingRequestId(requestId)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc("review_guild_join_request", {
      p_request_id: requestId,
      p_decision: decision,
    })
    setProcessingRequestId(null)

    if (error) {
      setMessage(createErrorMessage(error))
      return
    }

    setMessage(createSuccessMessage(decision === "approve" ? "参加申請を承認しました。" : "参加申請を却下しました。"))
    void fetchGuildPage(user)
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
              <p className="text-sm font-semibold">ギルド</p>
              <p className="text-xs text-muted-foreground">/guild/{guildName || "..."}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isMemberOfThisGuild && guild ? (
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link href={`/guild/${guild.name}/chat`}>
                  <PixelMessageDotsSolid className="size-4" />
                  チャット
                </Link>
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
          <section className="px-3 py-10 sm:px-4">
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">ギルドは見つかりませんでした。</div>
          </section>
        ) : (
          <>
            <section className="border-b border-border/80 px-3 py-5 sm:px-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-700 dark:text-sky-200">
                    <PixelCodeSolid className="size-4" />
                    <span>{guild.tag}</span>
                    <span>{guild.symbol}</span>
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight">/guild/{guild.name}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">メンバー {members.length} 人</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isMemberOfThisGuild && !belongsToDifferentGuild ? (
                    <Button onClick={handleJoinRequest} disabled={isJoining || myPendingRequest?.status === "pending"} className="gap-2">
                      <PixelUsersSolid className="size-4" />
                      {myPendingRequest?.status === "pending" ? "申請中" : isJoining ? "送信中..." : "参加申請"}
                    </Button>
                  ) : null}
                  {currentGuild && currentGuild.name !== guild.name ? (
                    <Button asChild variant="outline">
                      <Link href={`/guild/${currentGuild.name}`}>自分のギルド</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
              {myPendingRequest?.status === "pending" ? (
                <p className="mt-3 text-sm text-muted-foreground">このギルドへの参加申請は承認待ちです。</p>
              ) : belongsToDifferentGuild ? (
                <p className="mt-3 text-sm text-muted-foreground">すでに別のギルドに加入しているため、このギルドには申請できません。</p>
              ) : null}
            </section>

            <section className="border-b border-border/80 px-3 py-5 sm:px-4">
              <div className="mb-3 flex items-center gap-2">
                <PixelUsersSolid className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">メンバー</h2>
              </div>
              <div className="space-y-3">
                {members.map((member) => {
                  const memberProfile = getSingleProfile(member.profiles)
                  if (!memberProfile) return null

                  return (
                    <div key={member.user_id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background px-3 py-3">
                      <div>
                        <ProfileDisplayName
                          name={memberProfile.display_name}
                          font={memberProfile.display_font}
                          guildTag={guild.tag}
                          guildSymbol={guild.symbol}
                          textClassName="font-medium"
                        />
                        <p className="text-xs text-muted-foreground">@{memberProfile.username}</p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {member.role === "owner" ? "オーナー" : member.role === "admin" ? "管理者" : "メンバー"}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {isManager ? (
              <section className="border-b border-border/80 px-3 py-5 sm:px-4">
                <div className="mb-3 flex items-center gap-2">
                  <PixelUsersCrownSolid className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">参加申請</h2>
                </div>
                {pendingRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">現在の参加申請はありません。</div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((request) => {
                      const requestProfile = getSingleProfile(request.profiles)
                      if (!requestProfile) return null

                      return (
                        <div key={request.id} className="rounded-2xl border border-border/70 bg-background p-4">
                          <ProfileDisplayName name={requestProfile.display_name} font={requestProfile.display_font} textClassName="font-medium" />
                          <p className="text-xs text-muted-foreground">@{requestProfile.username}</p>
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" onClick={() => void handleReviewRequest(request.id, "approve")} disabled={processingRequestId === request.id}>
                              <Check className="size-4" />
                              承認
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleReviewRequest(request.id, "reject")} disabled={processingRequestId === request.id}>
                              <X className="size-4" />
                              却下
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            ) : null}

            <section className="px-3 py-5 sm:px-4">
              <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PixelMessageDotsSolid className="size-4 text-muted-foreground" />
                  ギルドチャット
                </div>
                <p className="mt-2 text-sm text-muted-foreground">チャットは専用ページに分離しました。流れを追いやすく、ヘッダーからもすぐ開けます。</p>
                <div className="mt-4">
                  {isMemberOfThisGuild ? (
                    <Button asChild>
                      <Link href={`/guild/${guild.name}/chat`}>チャットを開く</Link>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">チャットは加入メンバーのみ利用できます。</p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
          </>
        )}
      </main>

      <MobileBottomNav userId={user?.id ?? null} profileUsername={profileUsername} />
    </div>
  )
}

export default function GuildDetailPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">ギルド情報を読み込み中...</div>}>
      <GuildDetailPageContent />
    </Suspense>
  )
}
