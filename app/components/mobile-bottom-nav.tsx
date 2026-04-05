"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Bell, Home, LogIn, User, UserPlus } from "lucide-react"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type MobileBottomNavProps = {
  userId?: string | null
  profileUsername?: string | null
}

function formatCount(count: number) {
  if (count > 99) return "99+"
  return String(count)
}

export function MobileBottomNav({ userId = null, profileUsername = null }: MobileBottomNavProps) {
  const pathname = usePathname()
  const [resolvedUsername, setResolvedUsername] = useState(profileUsername)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    setResolvedUsername(profileUsername)
  }, [profileUsername])

  useEffect(() => {
    if (!userId || profileUsername) return

    const supabase = getSupabaseBrowserClient()
    void supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.username) {
          setResolvedUsername(data.username)
        }
      })
  }, [profileUsername, userId])

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      return
    }

    const supabase = getSupabaseBrowserClient()

    const fetchUnreadCount = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("is_read", false)

      setUnreadCount(count ?? 0)
    }

    void fetchUnreadCount()

    const channel = supabase
      .channel(`mobile-nav-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => void fetchUnreadCount(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const items = useMemo(() => {
    if (userId) {
      return [
        { href: "/", label: "ホーム", icon: Home, active: pathname === "/" },
        {
          href: "/notifications",
          label: "通知",
          icon: Bell,
          active: pathname.startsWith("/notifications"),
          badge: unreadCount,
        },
        {
          href: resolvedUsername ? `/user/${resolvedUsername}` : "/",
          label: "プロフィール",
          icon: User,
          active: pathname.startsWith("/user/"),
        },
      ]
    }

    return [
      { href: "/", label: "ホーム", icon: Home, active: pathname === "/" },
      { href: "/login", label: "ログイン", icon: LogIn, active: pathname.startsWith("/login") },
      { href: "/signup", label: "登録", icon: UserPlus, active: pathname.startsWith("/signup") },
    ]
  }, [pathname, resolvedUsername, unreadCount, userId])

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur sm:hidden">
      <div className="mx-auto grid h-16 max-w-[680px] grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                item.active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <div className="relative">
                <Icon className="size-4" />
                {"badge" in item && item.badge && item.badge > 0 ? (
                  <span className="absolute -right-3 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                    {formatCount(item.badge)}
                  </span>
                ) : null}
              </div>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
