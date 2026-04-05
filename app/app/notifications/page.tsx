"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft, LogOut } from "lucide-react"

import { AppMessageBanner, createErrorMessage, type AppMessage } from "@/components/app-message"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { ModeToggle } from "@/components/mode-toggle"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { Button } from "@/components/ui/button"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { ProfileLite } from "@/lib/post-types"

type NotificationItem = {
  id: string
  type: "like" | "reaction" | "follow" | "reply"
  post_id: string | null
  reaction_emoji: string | null
  is_read: boolean
  created_at: string
  actor: ProfileLite | null
}

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
})

function renderMessage(item: NotificationItem) {
  const actorName = item.actor?.display_name ?? item.actor?.username ?? "だれか"
  if (item.type === "like") return `${actorName}さんがあなたの投稿にいいねしました`
  if (item.type === "follow") return `${actorName}さんがあなたをフォローしました`
  if (item.type === "reply") return `${actorName}さんがあなたの投稿に返信しました`
  return `${actorName}さんがあなたの投稿にリアクションしました`
}

function linkFor(item: NotificationItem) {
  if (item.type === "follow") {
    return `/user/${item.actor?.username ?? ""}`
  }
  if (item.post_id) return `/post/${item.post_id}`
  return "/"
}

export default function NotificationsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileLite | null>(null)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [message, setMessage] = useState<AppMessage | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    const fetchData = async (authUser: User | null) => {
      if (!authUser) {
        setItems([])
        setProfile(null)
        return
      }

      const [profileResult, notificationsResult] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url, display_font").eq("id", authUser.id).maybeSingle(),
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
                avatar_url,
                display_font
              )
            `,
          )
          .eq("recipient_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ])

      if (profileResult.error || notificationsResult.error) {
        setMessage(createErrorMessage(profileResult.error?.message ?? notificationsResult.error?.message ?? "通知の取得に失敗しました。"))
        return
      }

      setProfile((profileResult.data ?? null) as ProfileLite | null)
      setItems((notificationsResult.data ?? []) as NotificationItem[])
      setMessage(null)

      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_id", authUser.id)
        .eq("is_read", false)
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

    const channel = supabase
      .channel("notifications-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void supabase.auth.getUser().then(({ data }) => fetchData(data.user))
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [])

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
              <Link href="/">
                <ArrowLeft className="size-4" />
                戻る
              </Link>
            </Button>
            <h1 className="text-lg font-semibold">通知</h1>
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
            通知を見るにはログインしてください。
          </div>
        ) : items.length === 0 ? (
          <div className="border-b border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            通知はありません。
          </div>
        ) : (
          <section>
            {items.map((item) => (
              <Link
                key={item.id}
                href={linkFor(item)}
                className="block border-b border-border/80 px-3 py-4 transition-colors hover:bg-muted/20 sm:px-4"
              >
                <p className="text-sm">{renderMessage(item)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{timeFormatter.format(new Date(item.created_at))}</p>
              </Link>
            ))}
          </section>
        )}
      </main>

      <MobileBottomNav userId={user?.id ?? null} profileUsername={profile?.username ?? null} />
    </div>
  )
}
