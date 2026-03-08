"use client"

import Link from "next/link"

import { ScrollArea } from "@/components/ui/scroll-area"

export type FollowUser = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}

type FollowersListProps = {
  users: FollowUser[]
  emptyText: string
}

export function FollowersList({ users, emptyText }: FollowersListProps) {
  if (users.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <ScrollArea className="h-[380px] pr-2">
      <div className="space-y-2">
        {users.map((target) => (
          <Link
            key={target.id}
            href={`/user/${target.username}`}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-3 transition hover:bg-muted/60"
          >
            <div className="grid size-9 place-items-center rounded-full border border-border bg-background text-sm font-semibold">
              {target.display_name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium">{target.display_name}</p>
              <p className="text-xs text-muted-foreground">@{target.username}</p>
            </div>
          </Link>
        ))}
      </div>
    </ScrollArea>
  )
}
