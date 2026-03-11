"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { LogOut, Send } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { NotificationBell } from "@/components/notification-bell"
import { PostCard } from "@/components/post-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/achievements"
import { hydratePostsRelations, pickSingleRelation, POST_SELECT_QUERY, type ProfileLite, type TimelinePost } from "@/lib/post-types"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export default function Home() {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [myProfile, setMyProfile] = useState<ProfileLite | null>(null)
  const [posts, setPosts] = useState<TimelinePost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [pendingLikePostId, setPendingLikePostId] = useState<string | null>(null)
  const [pendingRepostPostId, setPendingRepostPostId] = useState<string | null>(null)
  const [pendingReactionKey, setPendingReactionKey] = useState<string | null>(null)
  const [composerText, setComposerText] = useState("")
  const [quoteTarget, setQuoteTarget] = useState<TimelinePost | null>(null)
  const [replyTarget, setReplyTarget] = useState<TimelinePost | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const fetchMyProfile = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      setMessage(error.message)
      return
    }
    setMyProfile((data ?? null) as ProfileLite | null)
  }, [])

  const fetchPosts = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT_QUERY)
      .order("created_at", { ascending: false })
      .limit(120)

    if (error) {
      setMessage(error.message)
      setPosts([])
      setIsLoading(false)
      return
    }

    const baseRows = (data ?? []) as TimelinePost[]
    const hydratedRows = await hydratePostsRelations(supabase, baseRows)
    setPosts(hydratedRows)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    queueMicrotask(() => {
      void fetchPosts()
    })

    void supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        setMessage(error.message)
        return
      }
      setUser(data.user)
      if (data.user) void fetchMyProfile(data.user.id)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null
      setUser(authUser)
      if (authUser) {
        void fetchMyProfile(authUser.id)
      } else {
        setMyProfile(null)
      }
    })

    const channel = supabase
      .channel("timeline-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => void fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => void fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions" }, () => void fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void fetchPosts())
      .subscribe()

    return () => {
      subscription.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [fetchMyProfile, fetchPosts])

  const requireLogin = () => {
    router.push("/login")
  }

  const handleCreatePost = async () => {
    if (!user) {
      requireLogin()
      return
    }

    const content = composerText.trim()
    if (!quoteTarget && !replyTarget && content.length === 0) return
    if ((quoteTarget || replyTarget) && content.length === 0) {
      setMessage("引用・返信には本文の入力が必要です。")
      return
    }

    setIsPosting(true)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const payload = quoteTarget
      ? { user_id: user.id, content, repost_of_id: quoteTarget.id }
      : replyTarget
        ? { user_id: user.id, content, reply_to_id: replyTarget.id }
        : { user_id: user.id, content }

    const { error } = await supabase.from("posts").insert(payload)
    setIsPosting(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setComposerText("")
    setQuoteTarget(null)
    setReplyTarget(null)
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
    if (error) setMessage(error.message)
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
      setMessage(findError.message)
      return
    }

    const existing = repostRows?.[0]
    const request = existing
      ? supabase.from("posts").delete().eq("id", existing.id).eq("user_id", user.id)
      : supabase.from("posts").insert({ user_id: user.id, repost_of_id: post.id, content: null })

    const { error } = await request
    setPendingRepostPostId(null)
    if (error) setMessage(error.message)
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
    if (error) setMessage(error.message)
  }

  const handleDeletePost = async (post: TimelinePost) => {
    if (!user || post.user_id !== user.id) return

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("user_id", user.id)
    if (error) setMessage(error.message)
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
      setMessage(error.message)
      return
    }
    setMessage("通報しました")
  }

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
  }

  const repostCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const post of posts) {
      if (!post.repost_of_id) continue
      map.set(post.repost_of_id, (map.get(post.repost_of_id) ?? 0) + 1)
    }
    return map
  }, [posts])

  const statusText = isLoading ? "読み込み中" : `${posts.length} 個の投稿`
  const searchKeyword = searchQuery.trim().toLowerCase()

  const filteredPosts = useMemo(() => {
    if (!searchKeyword) return posts
    return posts.filter((post) => {
      const repost = pickSingleRelation(post.repost_of)
      const haystack = `${post.content ?? ""} ${post.profiles?.display_name ?? ""} @${post.profiles?.username ?? ""} ${
        repost?.content ?? ""
      }`.toLowerCase()
      return haystack.includes(searchKeyword)
    })
  }, [posts, searchKeyword])

  const matchedAchievementDefs = useMemo(() => {
    if (!searchKeyword) return []
    return ACHIEVEMENT_DEFINITIONS.filter((definition) => {
      const haystack = `${definition.name} ${definition.description} ${definition.rarity}`.toLowerCase()
      return haystack.includes(searchKeyword)
    })
  }, [searchKeyword])

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_0%,rgba(31,41,55,0.14),transparent_38%),radial-gradient(circle_at_90%_100%,rgba(15,23,42,0.14),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(71,85,105,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(71,85,105,0.08)_1px,transparent_1px)] bg-[size:36px_36px]" />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-72 pt-6 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex items-center justify-between"
        >
          <div>
            <p className="text-xs tracking-[0.24em] text-muted-foreground">HOSHI</p>
            <h1 className="text-xl font-semibold">タイムライン</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {user ? <NotificationBell userId={user.id} /> : null}
            {user ? (
              <>
                <div className="sm:hidden">
                  <MobileUserMenu profileUsername={myProfile?.username ?? null} onSignOut={handleSignOut} />
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <ModeToggle />
                  {myProfile ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/user/${myProfile.username}`}>プロフィール</Link>
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={handleSignOut}>
                    <LogOut className="size-4" />
                    <span>ログアウト</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <ModeToggle />
                <Button asChild variant="outline" size="sm">
                  <Link href="/login">ログイン</Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link href="/signup">アカウント作成</Link>
                </Button>
              </>
            )}
          </div>
        </motion.header>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground">タイムライン</h2>
            <p className="text-xs text-muted-foreground">
              {searchKeyword ? `${filteredPosts.length}件ヒット` : statusText}
            </p>
          </div>

          <div className="mb-4 hidden rounded-2xl border border-border/80 bg-card/80 p-3 shadow-sm sm:block">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="投稿を検索（本文 / ユーザー名 / 引用本文）"
              className="bg-background/80"
            />
            {searchKeyword ? (
              <p className="mt-2 text-xs text-muted-foreground">
                投稿 {filteredPosts.length} 件 / 実績名 {matchedAchievementDefs.length} 件
              </p>
            ) : null}
          </div>

          {searchKeyword && matchedAchievementDefs.length > 0 ? (
            <div className="mb-4 hidden rounded-2xl border border-border/80 bg-card/80 p-3 shadow-sm sm:block">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">一致した実績</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {matchedAchievementDefs.map((achievement) => (
                  <div key={achievement.id} className="rounded-xl border border-border/70 bg-muted/30 p-3">
                    <p className="text-sm font-medium">
                      {achievement.emoji} {achievement.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{achievement.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {message ? (
            <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {message}
            </p>
          ) : null}

          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-border/80 bg-card/70 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Skeleton className="size-9 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="mb-2 h-3 w-full" />
                  <Skeleton className="mb-2 h-3 w-11/12" />
                  <Skeleton className="mb-4 h-3 w-8/12" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              ))
            ) : filteredPosts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {searchKeyword ? "検索条件に一致する投稿はありません。" : "まだ投稿がない...ということはあなたが一番乗りです！"}
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredPosts.map((post, index) => (
                  <motion.div
                    key={post.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.24, delay: Math.min(index * 0.02, 0.1) }}
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
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">投稿する</p>
            <p className="text-xs text-muted-foreground">
              {user ? "ログイン中: 投稿できます" : "閲覧専用: 操作にはログインが必要です"}
            </p>
          </div>

          {quoteTarget ? (
            <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                @{quoteTarget.profiles?.username ?? "unknown"} の
                <Link href={`/post/${quoteTarget.id}`} className="underline underline-offset-2">
                  /post/{quoteTarget.id}
                </Link>
                を引用中
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{quoteTarget.content ?? "(repost)"}</p>
              <div className="mt-2">
                <Button size="xs" variant="outline" onClick={() => setQuoteTarget(null)}>
                  引用をキャンセル
                </Button>
              </div>
            </div>
          ) : null}

          {replyTarget ? (
            <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                @{replyTarget.profiles?.username ?? "unknown"} への
                <Link href={`/post/${replyTarget.id}`} className="underline underline-offset-2">
                  /post/{replyTarget.id}
                </Link>
                返信中
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{replyTarget.content ?? "(reply)"}</p>
              <div className="mt-2">
                <Button size="xs" variant="outline" onClick={() => setReplyTarget(null)}>
                  返信をキャンセル
                </Button>
              </div>
            </div>
          ) : null}

          <textarea
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            maxLength={500}
            placeholder={quoteTarget ? "引用する" : replyTarget ? "返信を書く" : "いま何してる？"}
            className="min-h-24 w-full resize-none rounded-xl border border-border/80 bg-background/90 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{composerText.length} / 500</p>
            <Button
              onClick={handleCreatePost}
              disabled={!user || isPosting || (!quoteTarget && !replyTarget && composerText.trim().length === 0)}
              size="sm"
            >
              <Send className="size-4" />
              {isPosting ? "投稿中..." : quoteTarget ? "引用投稿" : replyTarget ? "返信" : "投稿"}
            </Button>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
