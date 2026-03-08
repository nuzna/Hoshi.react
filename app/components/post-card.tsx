"use client"

import Link from "next/link"
import { useState } from "react"

import {
  Ellipsis,
  Flag,
  Heart,
  MessageCircleReply,
  MessageSquareQuote,
  Repeat2,
  SmilePlus,
  Trash2,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { TwemojiEmoji, TwemojiText } from "@/components/twemoji-text"
import { groupReactionCounts, pickSingleRelation, type TimelinePost } from "@/lib/post-types"
import { Trash2Icon } from "lucide-react"

type PostCardProps = {
  post: TimelinePost
  currentUserId: string | null
  onToggleLike: (post: TimelinePost) => void
  onStartReply: (post: TimelinePost) => void
  onToggleRepost: (post: TimelinePost) => void
  onStartQuote: (post: TimelinePost) => void
  onToggleReaction: (post: TimelinePost, emoji: string) => void
  onDeletePost: (post: TimelinePost) => void
  onReportPost: (post: TimelinePost, category: string, reason: string) => void
  pendingLikePostId: string | null
  pendingRepostPostId: string | null
  pendingReactionKey: string | null
  repostCount: number
}

const emojiPicker = [
  "😀",
  "😆",
  "😂",
  "🥹",
  "😍",
  "🤔",
  "😮",
  "👏",
  "🙏",
  "👍",
  "👀",
  "🔥",
  "💯",
  "🎉",
  "🚀",
  "❤️",
  "💙",
  "🖤",
  "✨",
  "🎯",
  "🍣",
  "🍜",
  "☕",
  "🐱",
]

const reportCategories = [
  { value: "spam", label: "スパム" },
  { value: "abuse", label: "嫌がらせ" },
  { value: "misinfo", label: "誤情報" },
  { value: "nsfw", label: "センシティブ" },
  { value: "other", label: "その他" },
]

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatPostDate(dateString: string) {
  return dateFormatter.format(new Date(dateString))
}

export function PostCard({
  post,
  currentUserId,
  onToggleLike,
  onStartReply,
  onToggleRepost,
  onStartQuote,
  onToggleReaction,
  onDeletePost,
  onReportPost,
  pendingLikePostId,
  pendingRepostPostId,
  pendingReactionKey,
  repostCount,
}: PostCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState("spam")
  const [reportReason, setReportReason] = useState("")

  const likeCount = post.post_likes?.length ?? 0
  const likedByMe = currentUserId !== null && (post.post_likes ?? []).some((like) => like.user_id === currentUserId)
  const reactedByMe = new Set(
    (post.post_reactions ?? [])
      .filter((reaction) => currentUserId !== null && reaction.user_id === currentUserId)
      .map((reaction) => reaction.emoji),
  )
  const reactionCounts = groupReactionCounts(post.post_reactions)
  const reactionRows = Array.from(reactionCounts.entries()).filter(([, count]) => count > 0)

  const displayName = post.profiles?.display_name ?? "名無し"
  const username = post.profiles?.username ?? "unknown-user"
  const replySource = pickSingleRelation(post.reply_to)
  const source = pickSingleRelation(post.repost_of)
  const isPureRepost = post.repost_of_id !== null && (post.content ?? "").trim() === ""
  const isOwner = currentUserId !== null && currentUserId === post.user_id

  return (
    <article className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm">
      {isPureRepost ? (
        <p className="mb-3 text-xs text-muted-foreground">
          <span className="font-medium">{displayName}</span> がリポストしました
        </p>
      ) : null}

      <div className="mb-3 flex items-start justify-between gap-3">
        <Link href={`/user/${username}`} className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-full border border-border bg-muted/50 text-sm font-semibold">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">@{username}</p>
          </div>
        </Link>

        <div className="flex items-center gap-1.5">
          <Link href={`/post/${post.id}`} className="text-xs text-muted-foreground hover:text-foreground">
            {formatPostDate(post.created_at)}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="投稿メニュー">
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwner ? (
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  削除
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setReportOpen(true)}>
                  <Flag className="size-4" />
                  通報
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {post.reply_to_id && replySource ? (
        <p className="mb-2 text-xs text-muted-foreground">
          <Link href={`/post/${replySource.id}`} className="underline underline-offset-2 hover:text-foreground">
            @{replySource.profiles?.username ?? "unknown-user"} に対する返信
          </Link>
        </p>
      ) : null}

      {post.content ? (
        <TwemojiText text={post.content} className="mb-4 text-sm leading-relaxed" emojiClassName="size-5" />
      ) : null}

      {post.repost_of_id && source ? (
        <div className="mb-4 rounded-xl border border-border/70 bg-muted/30 p-3">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              @{source.profiles?.username ?? "unknown-user"} / {source.profiles?.display_name ?? "名無し"} さんの投稿の引用
            </span>
            <Link href={`/post/${source.id}`} className="font-medium hover:text-foreground">
              元投稿を開く
            </Link>
          </div>
          <TwemojiText
            text={source.content ?? "(repost)"}
            className="text-xs leading-relaxed text-muted-foreground"
            emojiClassName="size-4"
          />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant={likedByMe ? "default" : "outline"}
          size="sm"
          onClick={() => onToggleLike(post)}
          disabled={pendingLikePostId === post.id}
        >
          <Heart className={`size-4 ${likedByMe ? "fill-current" : ""}`} />
          {likeCount}
        </Button>

        <Button variant="outline" size="sm" onClick={() => onStartReply(post)}>
          <MessageCircleReply className="size-4" />
          返信
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pendingRepostPostId === post.id}>
              <Repeat2 className="size-4" />
              共有する
              <span className="ml-1 text-xs text-muted-foreground">{repostCount}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onToggleRepost(post)}>
              <Repeat2 className="size-4" />
              リポスト
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onStartQuote(post)}>
              <MessageSquareQuote className="size-4" />
              引用
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SmilePlus className="size-4" />
              リアクション
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 p-2">
            <div className="grid grid-cols-8 gap-1">
              {emojiPicker.map((emoji) => {
                const key = `${post.id}:${emoji}`
                return (
                  <button
                    key={emoji}
                    type="button"
                    className="grid size-8 place-items-center rounded-md border border-border/60 bg-background hover:bg-muted"
                    onClick={() => onToggleReaction(post, emoji)}
                    disabled={pendingReactionKey === key}
                    aria-label={`${emoji}でリアクション`}
                  >
                    <TwemojiEmoji emoji={emoji} className="size-5" />
                  </button>
                )
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {reactionRows.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {reactionRows.map(([emoji, count]) => {
            const active = reactedByMe.has(emoji)
            const reactionKey = `${post.id}:${emoji}`
            return (
              <Button
                key={emoji}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleReaction(post, emoji)}
                disabled={pendingReactionKey === reactionKey}
                className="gap-1.5"
              >
                <TwemojiEmoji emoji={emoji} className="size-4" />
                <span>{count}</span>
              </Button>
            )
          })}
        </div>
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>削除した投稿は後から元に戻せません</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">取り消す</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDeletePost(post)
                setDeleteOpen(false)
              }}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reportOpen} onOpenChange={setReportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この投稿を通報しますか？</AlertDialogTitle>
            <AlertDialogDescription>カテゴリを選択して、必要なら詳細理由を入力してください。</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {reportCategories.map((category) => (
              <Button
                key={category.value}
                type="button"
                size="sm"
                variant={reportCategory === category.value ? "default" : "outline"}
                onClick={() => setReportCategory(category.value)}
              >
                {category.label}
              </Button>
            ))}
          </div>
          <Textarea
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            maxLength={500}
            placeholder="詳細理由（任意）"
            className="min-h-24"
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setReportCategory("spam")
                setReportReason("")
              }}
            >
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onReportPost(post, reportCategory, reportReason.trim())
                setReportCategory("spam")
                setReportReason("")
                setReportOpen(false)
              }}
            >
              通報する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
