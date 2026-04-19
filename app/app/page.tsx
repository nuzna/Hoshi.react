"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"

import type { User } from "@supabase/supabase-js"
import { ImagePlus, LogOut, Search, Send, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { AuthDialog } from "@/components/auth-dialog"
import { AdminNavButton } from "@/components/admin-nav-button"
import { AnnouncementDialog } from "@/components/announcement-dialog"
import { AppMessageBanner, createErrorMessage, createSuccessMessage, type AppMessage } from "@/components/app-message"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { NotificationBell } from "@/components/notification-bell"
import { PixelCodeSolid, PixelMessageDotsSolid } from "@/components/pixel-icons"
import { PostCard } from "@/components/post-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/achievements"
import { fetchPublicAdminUserIds } from "@/lib/admin-users"
import { guildFeatureEnabled } from "@/lib/guild-config"
import { collectPostUserIds, fetchCurrentUserGuild, fetchGuildDisplayMap, getSingleGuild, type GuildDisplay, type GuildMembershipWithGuild } from "@/lib/guilds"
import { deletePostWithMedia } from "@/lib/post-delete"
import {
  preparePostImageSelection,
  revokePendingPostImages,
  type PendingPostImage,
} from "@/lib/post-image"
import { hydratePostsRelations, pickSingleRelation, POST_SELECT_QUERY, type ProfileLite, type TimelinePost } from "@/lib/post-types"
import { uploadPostImagesToB2 } from "@/lib/post-upload"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type TimelineTab = "latest" | "following" | "trending"

function getDeterministicBoost(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return (hash % 1000) / 1000
}

function calculateTrendingScore(post: TimelinePost, replyCount: number, quoteCount: number, repostCount: number) {
  const likeCount = post.post_likes?.length ?? 0
  const reactionCount = post.post_reactions?.length ?? 0
  const hoursSincePosted = Math.max(0, (Date.now() - new Date(post.created_at).getTime()) / 3_600_000)
  const weightedEngagement =
    likeCount * 3.2 +
    replyCount * 4.8 +
    reactionCount * 1.3 +
    quoteCount * 4 +
    repostCount * 1.8 +
    (replyCount / (likeCount + 1)) * 2.4
  const tieBreaker = getDeterministicBoost(post.id) * 0.05

  if (weightedEngagement <= 0) {
    const quietPenalty = Math.min(hoursSincePosted, 72) * 0.03
    const freshnessFloor = Math.max(0, 6 - hoursSincePosted) * 0.015
    return freshnessFloor - quietPenalty + tieBreaker
  }

  const momentum = Math.log1p(weightedEngagement) * weightedEngagement
  const recencyBoost = hoursSincePosted < 12 ? (12 - hoursSincePosted) * 0.12 : 0
  return momentum / Math.pow(hoursSincePosted + 2, 1.28) + recencyBoost + tieBreaker
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [myProfile, setMyProfile] = useState<ProfileLite | null>(null)
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set())
  const [guildDisplayMap, setGuildDisplayMap] = useState<Map<string, GuildDisplay>>(new Map())
  const [myGuildMembership, setMyGuildMembership] = useState<GuildMembershipWithGuild | null>(null)
  const [posts, setPosts] = useState<TimelinePost[]>([])
  const [timelineTab, setTimelineTab] = useState<TimelineTab>("latest")
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [pendingLikePostId, setPendingLikePostId] = useState<string | null>(null)
  const [pendingRepostPostId, setPendingRepostPostId] = useState<string | null>(null)
  const [pendingReactionKey, setPendingReactionKey] = useState<string | null>(null)
  const [composerText, setComposerText] = useState("")
  const [composerImages, setComposerImages] = useState<PendingPostImage[]>([])
  const [quoteTarget, setQuoteTarget] = useState<TimelinePost | null>(null)
  const [replyTarget, setReplyTarget] = useState<TimelinePost | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [message, setMessage] = useState<AppMessage | null>(null)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [authDialogMode, setAuthDialogMode] = useState<"login" | "signup">("login")
  const composerFileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchMyProfile = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, display_font")
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      setMessage(createErrorMessage(error))
      return
    }
    setMyProfile((data ?? null) as ProfileLite | null)
  }, [])

  const fetchFollowingIds = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", userId)

    if (error) {
      setMessage(createErrorMessage(error))
      return
    }

    setFollowingIds((data ?? []).map((row) => row.following_id))
  }, [])

  const fetchMyGuild = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient()
    try {
      setMyGuildMembership(await fetchCurrentUserGuild(supabase, userId))
    } catch (error) {
      setMessage(createErrorMessage(error))
    }
  }, [])

  const fetchPosts = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT_QUERY)
      .order("created_at", { ascending: false })
      .limit(120)

    if (error) {
      setMessage(createErrorMessage(error))
      setPosts([])
      setIsLoading(false)
      return
    }

    const baseRows = (data ?? []) as TimelinePost[]
    const hydratedRows = await hydratePostsRelations(supabase, baseRows)
    setPosts(hydratedRows)
    try {
      setGuildDisplayMap(await fetchGuildDisplayMap(supabase, collectPostUserIds(hydratedRows)))
    } catch {
      setGuildDisplayMap(new Map())
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    queueMicrotask(() => {
      void fetchPosts()
      void fetchPublicAdminUserIds(supabase)
        .then((ids) => setAdminUserIds(ids))
        .catch((error) => setMessage(createErrorMessage(error)))
    })

    void supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        setMessage(createErrorMessage(error))
        return
      }
      setUser(data.user)
      if (data.user) {
        void fetchMyProfile(data.user.id)
        if (guildFeatureEnabled) {
          void fetchMyGuild(data.user.id)
        } else {
          setMyGuildMembership(null)
        }
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null
      setUser(authUser)
      if (authUser) {
        void fetchMyProfile(authUser.id)
        if (guildFeatureEnabled) {
          void fetchMyGuild(authUser.id)
        } else {
          setMyGuildMembership(null)
        }
      } else {
        setMyProfile(null)
        setMyGuildMembership(null)
      }
    })

    const channel = supabase
      .channel("timeline-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => void fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_images" }, () => void fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => void fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions" }, () => void fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void fetchPosts())
      .subscribe()

    return () => {
      subscription.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [fetchMyGuild, fetchMyProfile, fetchPosts])

  useEffect(() => {
    if (!user) {
      setFollowingIds([])
      if (timelineTab === "following") {
        setTimelineTab("latest")
      }
      return
    }

    const supabase = getSupabaseBrowserClient()
    void fetchFollowingIds(user.id)

    const channel = supabase
      .channel(`home-follows-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${user.id}` },
        () => void fetchFollowingIds(user.id),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchFollowingIds, timelineTab, user])

  useEffect(() => {
    return () => {
      revokePendingPostImages(composerImages)
    }
  }, [composerImages])

  const openAuthDialog = (mode: "login" | "signup") => {
    setAuthDialogMode(mode)
    setAuthDialogOpen(true)
  }

  const requireLogin = () => {
    openAuthDialog("login")
  }

  const resetComposerMedia = () => {
    revokePendingPostImages(composerImages)
    setComposerImages([])
    if (composerFileInputRef.current) {
      composerFileInputRef.current.value = ""
    }
  }

  const handleComposerImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles?.length) return

    try {
      const prepared = await preparePostImageSelection(selectedFiles, composerImages.length)
      setComposerImages((current) => [...current, ...prepared])
      setMessage(null)
    } catch (error) {
      setMessage(createErrorMessage(error, "画像の準備に失敗しました。"))
    } finally {
      event.target.value = ""
    }
  }

  const handleRemoveComposerImage = (index: number) => {
    setComposerImages((current) => {
      const target = current[index]
      if (target) {
        revokePendingPostImages([target])
      }
      return current.filter((_, currentIndex) => currentIndex !== index)
    })
  }

  const handleCreatePost = async () => {
    if (!user) {
      requireLogin()
      return
    }

    const content = composerText.trim()
    const hasImages = composerImages.length > 0
    if (!quoteTarget && !replyTarget && content.length === 0 && !hasImages) return
    if ((quoteTarget || replyTarget) && content.length === 0 && !hasImages) {
      setMessage(createErrorMessage("引用や返信には本文または画像が必要です。"))
      return
    }

    setIsPosting(true)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const payload = quoteTarget
      ? { user_id: user.id, content: content || null, repost_of_id: quoteTarget.id, has_media: hasImages }
      : replyTarget
        ? { user_id: user.id, content: content || null, reply_to_id: replyTarget.id, has_media: hasImages }
        : { user_id: user.id, content: content || null, has_media: hasImages }

    const { data: createdPost, error } = await supabase.from("posts").insert(payload).select("id").single()

    if (error) {
      setIsPosting(false)
      setMessage(createErrorMessage(error))
      return
    }

    if (createdPost && hasImages) {
      try {
        const uploadedImages = await uploadPostImagesToB2(composerImages)
        const { error: imageInsertError } = await supabase.from("post_images").insert(
          uploadedImages.map((image) => ({
            post_id: createdPost.id,
            url: image.url,
            storage_key: image.fileName,
            mime_type: image.mimeType,
            size_bytes: image.sizeBytes,
            width: image.width,
            height: image.height,
            sort_order: image.sortOrder,
          })),
        )

        if (imageInsertError) {
          await supabase.from("posts").delete().eq("id", createdPost.id).eq("user_id", user.id)
          setIsPosting(false)
          setMessage(createErrorMessage(imageInsertError))
          return
        }
      } catch (uploadError) {
        await supabase.from("posts").delete().eq("id", createdPost.id).eq("user_id", user.id)
        setIsPosting(false)
        setMessage(createErrorMessage(uploadError, "画像アップロードに失敗しました。"))
        return
      }
    }

    setIsPosting(false)
    setComposerText("")
    setQuoteTarget(null)
    setReplyTarget(null)
    resetComposerMedia()
  }

  const handleToggleLike = async (post: TimelinePost) => {
    if (!user) {
      requireLogin()
      return
    }

    setPendingLikePostId(post.id)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const isLiked = (post.post_likes ?? []).some((like) => like.user_id === user.id)
    const request = isLiked
      ? supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id)
      : supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id })

    const { error } = await request

    setPendingLikePostId(null)
    if (error) setMessage(createErrorMessage(error))
  }

  const handleToggleRepost = async (post: TimelinePost) => {
    if (!user) {
      requireLogin()
      return
    }

    setPendingRepostPostId(post.id)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const { data: repostRows, error: findError } = await supabase
      .from("posts")
      .select("id")
      .eq("user_id", user.id)
      .eq("repost_of_id", post.id)
      .is("content", null)
      .limit(1)

    if (findError) {
      setPendingRepostPostId(null)
      setMessage(createErrorMessage(findError))
      return
    }

    const existing = repostRows?.[0]
    const request = existing
      ? supabase.from("posts").delete().eq("id", existing.id).eq("user_id", user.id)
      : supabase.from("posts").insert({ user_id: user.id, repost_of_id: post.id, content: null })

    const { error } = await request
    setPendingRepostPostId(null)
    if (error) setMessage(createErrorMessage(error))
  }

  const handleToggleReaction = async (post: TimelinePost, emoji: string) => {
    if (!user) {
      requireLogin()
      return
    }

    const key = `${post.id}:${emoji}`
    setPendingReactionKey(key)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const hasReaction = (post.post_reactions ?? []).some(
      (reaction) => reaction.user_id === user.id && reaction.emoji === emoji,
    )

    const request = hasReaction
      ? supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id)
          .eq("emoji", emoji)
      : supabase.from("post_reactions").insert({ post_id: post.id, user_id: user.id, emoji })

    const { error } = await request

    setPendingReactionKey(null)
    if (error) setMessage(createErrorMessage(error))
  }

  const handleDeletePost = async (post: TimelinePost) => {
    if (!user || post.user_id !== user.id) return

    try {
      await deletePostWithMedia(post.id)
    } catch (error) {
      setMessage(createErrorMessage(error, "投稿削除に失敗しました。"))
    }
  }

  const handleReportPost = async (post: TimelinePost, category: string, reason: string) => {
    if (!user) {
      requireLogin()
      return
    }
    if (post.user_id === user.id) return

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from("post_reports").upsert({
      post_id: post.id,
      reporter_id: user.id,
      reason_category: category,
      reason,
    })

    if (error) {
      setMessage(createErrorMessage(error))
      return
    }
    setMessage(createSuccessMessage("通報しました"))
  }

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(createErrorMessage(error))
  }

  const repostCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const post of posts) {
      if (!post.repost_of_id) continue
      map.set(post.repost_of_id, (map.get(post.repost_of_id) ?? 0) + 1)
    }
    return map
  }, [posts])

  const replyCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const post of posts) {
      if (!post.reply_to_id) continue
      map.set(post.reply_to_id, (map.get(post.reply_to_id) ?? 0) + 1)
    }
    return map
  }, [posts])

  const quoteCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const post of posts) {
      if (!post.repost_of_id || (post.content ?? "").trim() === "") continue
      map.set(post.repost_of_id, (map.get(post.repost_of_id) ?? 0) + 1)
    }
    return map
  }, [posts])

  const timelinePosts = useMemo(() => {
    if (timelineTab === "following") {
      if (!user) return []
      const visibleIds = new Set([...followingIds, user.id])
      return posts.filter((post) => visibleIds.has(post.user_id))
    }

    if (timelineTab === "trending") {
      return [...posts].sort((left, right) => {
        const leftScore = calculateTrendingScore(
          left,
          replyCountMap.get(left.id) ?? 0,
          quoteCountMap.get(left.id) ?? 0,
          repostCountMap.get(left.id) ?? 0,
        )
        const rightScore = calculateTrendingScore(
          right,
          replyCountMap.get(right.id) ?? 0,
          quoteCountMap.get(right.id) ?? 0,
          repostCountMap.get(right.id) ?? 0,
        )

        if (rightScore === leftScore) {
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        }
        return rightScore - leftScore
      })
    }

    return posts
  }, [followingIds, posts, quoteCountMap, replyCountMap, repostCountMap, timelineTab, user])

  const searchKeyword = searchQuery.trim().toLowerCase()
  const statusText = isLoading ? "読み込み中" : `${timelinePosts.length} 件の投稿`

  const filteredPosts = useMemo(() => {
    if (!searchKeyword) return timelinePosts
    return timelinePosts.filter((post) => {
      const repost = pickSingleRelation(post.repost_of)
      const haystack = `${post.content ?? ""} ${post.profiles?.display_name ?? ""} @${post.profiles?.username ?? ""} ${
        repost?.content ?? ""
      }`.toLowerCase()
      return haystack.includes(searchKeyword)
    })
  }, [searchKeyword, timelinePosts])

  const matchedAchievementDefs = useMemo(() => {
    if (!searchKeyword) return []
    return ACHIEVEMENT_DEFINITIONS.filter((definition) => {
      const haystack = `${definition.name} ${definition.description} ${definition.rarity}`.toLowerCase()
      return haystack.includes(searchKeyword)
    })
  }, [searchKeyword])

  const currentGuild = getSingleGuild(myGuildMembership?.guilds)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-[680px] items-center justify-between px-5 py-3 sm:px-6">
          <div>
            <p className="text-[11px] tracking-[0.24em] text-muted-foreground">HOSHI</p>
            <h1 className="text-lg font-semibold">タイムライン</h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <AnnouncementDialog />
            <div className="hidden sm:block">{user ? <NotificationBell userId={user.id} /> : null}</div>
            {user && guildFeatureEnabled ? (
              <Button asChild variant="ghost" size="icon-sm" className="sm:hidden">
                <Link href={currentGuild ? `/guild/${currentGuild.name}` : "/guild"} aria-label="ギルド">
                  <PixelCodeSolid className="size-4" />
                </Link>
              </Button>
            ) : null}
            {user && guildFeatureEnabled && currentGuild ? (
              <Button asChild variant="ghost" size="icon-sm" className="sm:hidden">
                <Link href={`/guild/${currentGuild.name}/chat`} aria-label="ギルドチャット">
                  <PixelMessageDotsSolid className="size-4" />
                </Link>
              </Button>
            ) : null}
            {user ? (
              <>
                <div className="sm:hidden">
                  <MobileUserMenu profileUsername={myProfile?.username ?? null} onSignOut={handleSignOut} />
                </div>
                <div className="hidden items-center gap-1 sm:flex">
                  <ModeToggle />
                  <AdminNavButton userId={user.id} />
                  {guildFeatureEnabled ? (
                    <Button asChild variant="ghost" size="sm" className="gap-2">
                      <Link href={currentGuild ? `/guild/${currentGuild.name}` : "/guild"}>
                        <PixelCodeSolid className="size-4" />
                        ギルド
                      </Link>
                    </Button>
                  ) : null}
                  {guildFeatureEnabled && currentGuild ? (
                    <Button asChild variant="ghost" size="sm" className="gap-2">
                      <Link href={`/guild/${currentGuild.name}/chat`}>
                        <PixelMessageDotsSolid className="size-4" />
                        チャット
                      </Link>
                    </Button>
                  ) : null}
                  {myProfile ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/user/${myProfile.username}`}>プロフィール</Link>
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={handleSignOut}>
                    <LogOut className="size-4" />
                    <span>ログアウト</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <ModeToggle />
                <Button variant="ghost" size="sm" onClick={() => openAuthDialog("login")}>
                  ログイン
                </Button>
                <Button size="sm" className="rounded-full" onClick={() => openAuthDialog("signup")}>
                  登録
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      <main className="mx-auto w-full max-w-[680px] px-5 pb-36 sm:px-6 sm:pb-36">
        <section className="border-b border-border/80 py-3">
          <div className="flex items-center gap-3">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="投稿 / ユーザー / 実績を検索"
              className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 pl-3"
            />
            {searchQuery ? (
              <Button variant="ghost" size="icon-sm" onClick={() => setSearchQuery("")} aria-label="検索をクリア">
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <p>{searchKeyword ? `${filteredPosts.length}件ヒット` : statusText}</p>
            {searchKeyword ? <p>実績 {matchedAchievementDefs.length} 件</p> : null}
          </div>
        </section>

        {searchKeyword && matchedAchievementDefs.length > 0 ? (
          <section className="border-b border-border/80 py-3">
            <p className="mb-2 text-xs tracking-wide text-muted-foreground">一致した実績</p>
            <div className="flex flex-wrap gap-2">
              {matchedAchievementDefs.map((achievement) => (
                <div key={achievement.id} className="rounded-full border border-border/80 px-3 py-1.5 text-sm">
                  {achievement.emoji} {achievement.name}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <AppMessageBanner message={message} className="mt-3" />

        <Tabs value={timelineTab} onValueChange={(value) => setTimelineTab(value as TimelineTab)} className="mt-3">
          <TabsList variant="line" className="mx-auto max-w-md">
            <TabsTrigger value="latest">最新</TabsTrigger>
            <TabsTrigger value="following">フォロー中</TabsTrigger>
            <TabsTrigger value="trending">人気</TabsTrigger>
          </TabsList>

          {guildFeatureEnabled ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href="/guild">
                  <PixelCodeSolid className="size-4" />
                  ギルドを探す
                </Link>
              </Button>
              {currentGuild ? (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/guild/${currentGuild.name}`}>自分のギルド</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="gap-2">
                    <Link href={`/guild/${currentGuild.name}/chat`}>
                      <PixelMessageDotsSolid className="size-4" />
                      チャット
                    </Link>
                  </Button>
                </>
              ) : user ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/guild">ギルドを作る</Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {(["latest", "following", "trending"] as const).map((tabValue) => (
            <TabsContent key={tabValue} value={tabValue}>
              <section>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="border-b border-border/80 px-3 py-4">
                      <div className="mb-3 flex items-center gap-3">
                        <Skeleton className="size-10 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="mb-2 h-3 w-full" />
                      <Skeleton className="mb-2 h-3 w-10/12" />
                      <div className="mt-4 flex gap-4">
                        <Skeleton className="h-7 w-14 rounded-full" />
                        <Skeleton className="h-7 w-14 rounded-full" />
                        <Skeleton className="h-7 w-14 rounded-full" />
                      </div>
                    </div>
                  ))
                ) : filteredPosts.length === 0 ? (
                  <div className="border-b border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
                    {searchKeyword
                      ? "検索条件に一致する投稿はありません。"
                      : timelineTab === "following" && !user
                        ? "フォロー中タブはログインすると使えます。"
                        : timelineTab === "following"
                          ? "フォロー中ユーザーの投稿はまだありません。"
                          : "まだ投稿がありません。"}
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {filteredPosts.map((post, index) => (
                      <motion.div
                        key={post.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, delay: Math.min(index * 0.015, 0.08) }}
                      >
                        <PostCard
                          post={post}
                          currentUserId={user?.id ?? null}
                          onToggleLike={handleToggleLike}
                          onStartReply={(target) => {
                            setReplyTarget(target)
                            setQuoteTarget(null)
                          }}
                          onToggleRepost={handleToggleRepost}
                          onStartQuote={(target) => {
                            setQuoteTarget(target)
                            setReplyTarget(null)
                          }}
                          onToggleReaction={handleToggleReaction}
                          onDeletePost={handleDeletePost}
                          onReportPost={handleReportPost}
                          pendingLikePostId={pendingLikePostId}
                          pendingRepostPostId={pendingRepostPostId}
                  pendingReactionKey={pendingReactionKey}
                  repostCount={repostCountMap.get(post.id) ?? 0}
                  adminUserIds={adminUserIds}
                  guildDisplayMap={guildDisplayMap}
                />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </section>
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-border/80 bg-background/95 backdrop-blur sm:bottom-0">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mx-auto w-full max-w-[680px] px-5 py-3 sm:px-6"
        >
          {(quoteTarget || replyTarget) && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-full border border-border/80 bg-muted/35 px-3 py-1.5 text-xs">
              <div className="min-w-0 text-muted-foreground">
                <span className="mr-2 font-medium text-foreground">{quoteTarget ? "引用中" : "返信中"}</span>
                <span className="truncate">
                  @{(quoteTarget ?? replyTarget)?.profiles?.username ?? "unknown"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="rounded-full"
                onClick={() => {
                  setQuoteTarget(null)
                  setReplyTarget(null)
                }}
                aria-label={quoteTarget ? "引用を解除" : "返信を解除"}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}

          {composerImages.length > 0 ? (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {composerImages.map((image, index) => (
                <div key={`${image.file.name}-${index}`} className="relative shrink-0">
                  <img
                    src={image.previewUrl}
                    alt="投稿画像のプレビュー"
                    className="size-16 rounded-2xl border border-border/80 object-cover"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    className="absolute -right-1 -top-1 rounded-full"
                    onClick={() => handleRemoveComposerImage(index)}
                    aria-label="画像を削除"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <input
              ref={composerFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleComposerImageSelect}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-full"
              onClick={() => composerFileInputRef.current?.click()}
              aria-label="画像を追加"
            >
              <ImagePlus className="size-4" />
            </Button>
            <Textarea
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              maxLength={500}
              placeholder={quoteTarget ? "引用を書く" : replyTarget ? "返信を書く" : "いま何してる？"}
              className="h-11 min-h-11 resize-none rounded-full border-border/80 bg-muted/35 px-4 py-3 leading-none shadow-none focus-visible:ring-0"
            />
            <Button
              onClick={handleCreatePost}
              disabled={isPosting || (!quoteTarget && !replyTarget && composerText.trim().length === 0 && composerImages.length === 0)}
              className="size-11 shrink-0 rounded-full"
            >
              <Send className="size-4" />
              <span className="sr-only">{isPosting ? "投稿中" : "投稿"}</span>
            </Button>
          </div>
        </motion.section>
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} mode={authDialogMode} />
      <MobileBottomNav userId={user?.id ?? null} profileUsername={myProfile?.username ?? null} />
    </div>
  )
}
