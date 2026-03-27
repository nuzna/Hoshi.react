"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TwemojiEmoji } from "@/components/twemoji-text"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { ProfileLite } from "@/lib/post-types"

type NotificationItem = {
  id: string
  type: "like" | "reaction" | "follow"
  post_id: string | null
  reaction_emoji: string | null
  is_read: boolean
  created_at: string
  actor: ProfileLite | null
}

type NotificationBellProps = {
  userId: string
}

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
})

function formatCount(count: number) {
  if (count > 99) return "99+"
  return String(count)
}

function renderMessage(item: NotificationItem) {
  const actorName = item.actor?.display_name ?? item.actor?.username ?? "だれか"
  if (item.type === "like") return `${actorName}さんがあなたの投稿にいいねしました`
  if (item.type === "follow") return `${actorName}さんがあなたをフォローしました`
  return `${actorName}さんがあなたの投稿にリアクションしました`
}

function linkFor(item: NotificationItem) {
  if (item.type === "follow") {
    return `/user/${item.actor?.username ?? ""}`
  }
  if (item.post_id) return `/post/${item.post_id}`
  return "/"
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    const [listResult, countResult] = await Promise.all([
      supabase
        .from("notifications")
        .select(
          `
            id,
            type,
            post_id,
            reaction_emoji,
            is_read,
            created_at,
            actor:profiles!notifications_actor_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          `,
        )
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("is_read", false),
    ])

    if (listResult.error) {
      setErrorMessage(listResult.error.message)
      return
    }
    if (countResult.error) {
      setErrorMessage(countResult.error.message)
      return
    }

    setItems((listResult.data ?? []) as NotificationItem[])
    setUnreadCount(countResult.count ?? 0)
    setErrorMessage(null)
  }, [userId])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    queueMicrotask(() => {
      void fetchNotifications()
    })

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void fetchNotifications()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchNotifications, userId])

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen || unreadCount === 0) return

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", userId)
      .eq("is_read", false)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setUnreadCount(0)
    setItems((prev) => prev.map((item) => ({ ...item, is_read: true })))
  }

  const sorted = useMemo(() => items, [items])

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative">
          <Bell className="size-4" />
          <span className="sr-only">通知</span>
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {formatCount(unreadCount)}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>通知</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {errorMessage ? (
          <div className="px-2 py-2 text-xs text-destructive">{errorMessage}</div>
        ) : sorted.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">通知はありません</div>
        ) : (
          sorted.map((item) => (
            <DropdownMenuItem key={item.id} asChild className="items-start py-2">
              <Link href={linkFor(item)} className="grid w-full gap-1">
                <div className="flex items-center gap-1 text-xs">
                  <span>{renderMessage(item)}</span>
                  {item.type === "reaction" && item.reaction_emoji ? (
                    <TwemojiEmoji emoji={item.reaction_emoji} className="size-3.5" />
                  ) : null}
                </div>
                <span className="text-[11px] text-muted-foreground">{timeFormatter.format(new Date(item.created_at))}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
