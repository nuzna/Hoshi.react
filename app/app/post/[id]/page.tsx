"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft, LogOut, Send } from "lucide-react"

import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { NotificationBell } from "@/components/notification-bell"
import { PostCard } from "@/components/post-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { hydratePostsRelations, POST_SELECT_QUERY, type TimelinePost } from "@/lib/post-types"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

function PostDetailContent() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const postId = params?.id ?? ""

  const [user, setUser] = useState<User | null>(null)
  const [post, setPost] = useState<TimelinePost | null>(null)
  const [replies, setReplies] = useState<TimelinePost[]>([])
  const [repostCount, setRepostCount] = useState(0)
  const [replyRepostCounts, setReplyRepostCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [composerText, setComposerText] = useState("")
  const [quoteTarget, setQuoteTarget] = useState<TimelinePost | null>(null)
  const [replyTarget, setReplyTarget] = useState<TimelinePost | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [pendingLikePostId, setPendingLikePostId] = useState<string | null>(null)
  const [pendingRepostPostId, setPendingRepostPostId] = useState<string | null>(null)
  const [pendingReactionKey, setPendingReactionKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchPost = useCallback(async () => {
    if (!postId) return

    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT_QUERY)
      .eq("id", postId)
      .maybeSingle()

    if (error) {
      setMessage(error.message)
      setPost(null)
      setIsLoading(false)
      return
    }

    const basePost = (data ?? null) as TimelinePost | null
    if (basePost) {
      const [hydrated] = await hydratePostsRelations(supabase, [basePost])
      setPost(hydrated ?? null)
    } else {
      setPost(null)
    }

    if (!data) {
      setRepostCount(0)
      setIsLoading(false)
      return
    }

    const { count, error: countError } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("repost_of_id", postId)

    if (!countError) setRepostCount(count ?? 0)
    setIsLoading(false)
  }, [postId])

  const fetchReplies = useCallback(async () => {
    if (!postId) return

    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT_QUERY)
      .eq("reply_to_id", postId)
      .order("created_at", { ascending: true })

    if (error) {
      setMessage(error.message)
      setReplies([])
      setReplyRepostCounts({})
      return
    }

    const replyRows = (data ?? []) as TimelinePost[]
    const hydratedReplies = await hydratePostsRelations(supabase, replyRows)
    setReplies(hydratedReplies)

    if (hydratedReplies.length === 0) {
      setReplyRepostCounts({})
      return
    }

    const replyIds = hydratedReplies.map((item) => item.id)
    const { data: repostRows, error: repostError } = await supabase
      .from("posts")
      .select("repost_of_id")
      .in("repost_of_id", replyIds)

    if (repostError) {
      setReplyRepostCounts({})
      return
    }

    const counts: Record<string, number> = {}
    for (const row of repostRows ?? []) {
      const targetId = row.repost_of_id as string | null
      if (!targetId) continue
      counts[targetId] = (counts[targetId] ?? 0) + 1
    }
    setReplyRepostCounts(counts)
  }, [postId])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    queueMicrotask(() => {
      void Promise.all([fetchPost(), fetchReplies()])
    })
    void supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    const channel = supabase
      .channel(`post-page-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        void Promise.all([fetchPost(), fetchReplies()])
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => {
        void Promise.all([fetchPost(), fetchReplies()])
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions" }, () => {
        void Promise.all([fetchPost(), fetchReplies()])
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void Promise.all([fetchPost(), fetchReplies()])
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [fetchPost, fetchReplies, postId])

  const requireLogin = () => {
    router.push("/login")
  }

  const handleCreateQuote = async () => {
    if (!user) {
      requireLogin()
      return
    }
    if (!quoteTarget && !replyTarget) return

    const content = composerText.trim()
    if (!content) {
      setMessage("引用・返信には本文の入力が必要です。")
      return
    }

    setIsPosting(true)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const payload = quoteTarget
      ? { user_id: user.id, content, repost_of_id: quoteTarget.id }
      : { user_id: user.id, content, reply_to_id: replyTarget?.id ?? null }

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

  const handleToggleLike = async (targetPost: TimelinePost) => {
    if (!user) {
      requireLogin()
      return
    }

    setPendingLikePostId(targetPost.id)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const liked = (targetPost.post_likes ?? []).some((like) => like.user_id === user.id)
    const request = liked
      ? supabase.from("post_likes").delete().eq("post_id", targetPost.id).eq("user_id", user.id)
      : supabase.from("post_likes").insert({ post_id: targetPost.id, user_id: user.id })

    const { error } = await request

    setPendingLikePostId(null)
    if (error) setMessage(error.message)
  }

  const handleToggleRepost = async (targetPost: TimelinePost) => {
    if (!user) {
      requireLogin()
      return
    }

    setPendingRepostPostId(targetPost.id)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const { data: rows, error: findError } = await supabase
      .from("posts")
      .select("id")
      .eq("user_id", user.id)
      .eq("repost_of_id", targetPost.id)
      .is("content", null)
      .limit(1)

    if (findError) {
      setPendingRepostPostId(null)
      setMessage(findError.message)
      return
    }

    const existing = rows?.[0]
    const request = existing
      ? supabase.from("posts").delete().eq("id", existing.id).eq("user_id", user.id)
      : supabase.from("posts").insert({ user_id: user.id, repost_of_id: targetPost.id, content: null })

    const { error } = await request
    setPendingRepostPostId(null)
    if (error) setMessage(error.message)
  }

  const handleToggleReaction = async (targetPost: TimelinePost, emoji: string) => {
    if (!user) {
      requireLogin()
      return
    }

    const key = `${targetPost.id}:${emoji}`
    setPendingReactionKey(key)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const hasReaction = (targetPost.post_reactions ?? []).some(
      (reaction) => reaction.user_id === user.id && reaction.emoji === emoji,
    )

    const request = hasReaction
      ? supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", targetPost.id)
          .eq("user_id", user.id)
          .eq("emoji", emoji)
      : supabase.from("post_reactions").insert({ post_id: targetPost.id, user_id: user.id, emoji })

    const { error } = await request

    setPendingReactionKey(null)
    if (error) setMessage(error.message)
  }

  const handleDeletePost = async (targetPost: TimelinePost) => {
    if (!user || targetPost.user_id !== user.id) return

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from("posts").delete().eq("id", targetPost.id).eq("user_id", user.id)
    if (error) setMessage(error.message)
  }

  const handleReportPost = async (targetPost: TimelinePost, category: string, reason: string) => {
    if (!user) {
      requireLogin()
      return
    }
    if (targetPost.user_id === user.id) return

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from("post_reports").upsert({
      post_id: targetPost.id,
      reporter_id: user.id,
      reason_category: category,
      reason,
    })

    if (error) {
      setMessage(error.message)
      return
    }
    setMessage("報告しました。ご協力ありがとうございます。")
  }

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_0%,rgba(31,41,55,0.14),transparent_36%),radial-gradient(circle_at_90%_100%,rgba(15,23,42,0.14),transparent_42%)]" />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft className="size-4" />
                タイムライン
              </Link>
            </Button>
            <h1 className="text-lg font-semibold">投稿詳細</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {user ? <NotificationBell userId={user.id} /> : null}
            {user ? (
              <>
                <div className="sm:hidden">
                  <MobileUserMenu profileUsername={null} onSignOut={handleSignOut} />
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <ModeToggle />
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
              </>
            )}
          </div>
        </header>

        {message ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {message}
          </p>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-border/80 bg-card/80 p-5">
            <Skeleton className="mb-2 h-3 w-40" />
            <Skeleton className="mb-2 h-3 w-full" />
            <Skeleton className="h-3 w-9/12" />
          </div>
        ) : !post ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            投稿が見つかりませんでした。
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-border/80 bg-card/90 p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                URL:{" "}
                <Link href={`/post/${post.id}`} className="underline underline-offset-2">
                  /post/{post.id}
                </Link>
              </p>
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
                repostCount={repostCount}
              />
            </section>

            <section className="rounded-2xl border border-border/80 bg-card/90 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">この投稿への返信</h2>
                <p className="text-xs text-muted-foreground">{replies.length}件</p>
              </div>

              <div className="space-y-3">
                {replies.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    まだ返信はありません
                  </div>
                ) : (
                  replies.map((reply) => (
                    <PostCard
                      key={reply.id}
                      post={reply}
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
                      repostCount={replyRepostCounts[reply.id] ?? 0}
                    />
                  ))
                )}
              </div>
            </section>

            {quoteTarget || replyTarget ? (
              <section className="rounded-2xl border border-border/80 bg-card/90 p-4">
                <p className="mb-2 text-sm font-medium">{quoteTarget ? "この投稿を引用" : "この投稿に返信"}</p>
                <textarea
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  maxLength={500}
                  placeholder={quoteTarget ? "引用コメントを書く" : "返信を書く"}
                  className="min-h-24 w-full resize-none rounded-xl border border-border/80 bg-background/80 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuoteTarget(null)
                      setReplyTarget(null)
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button size="sm" onClick={handleCreateQuote} disabled={!user || isPosting}>
                    <Send className="size-4" />
                    {isPosting ? "投稿中..." : quoteTarget ? "引用投稿" : "返信"}
                  </Button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}

export default function PostDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">
          投稿を読み込み中
        </div>
      }
    >
      <PostDetailContent />
    </Suspense>
  )
}
