"use client"

import Image from "next/image"
import Link from "next/link"

import type { Database } from "@/lib/supabase/types"

type SpotifyPresence = Database["public"]["Tables"]["spotify_presence_cache"]["Row"]

type SpotifyWidgetProps = {
  presence: SpotifyPresence
  compact?: boolean
}

function formatPlayedAt(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SpotifyWidget({ presence, compact = false }: SpotifyWidgetProps) {
  if (!presence.is_connected || !presence.track_name) return null

  const playedAt = formatPlayedAt(presence.played_at)

  return (
    <div className="rounded-2xl border border-border/80 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Spotify
          </p>
          <p className="text-sm text-muted-foreground">
            {presence.is_playing ? "現在再生中" : "最後に再生した曲"}
          </p>
        </div>
        {presence.spotify_display_name ? (
          <p className="text-xs text-muted-foreground">{presence.spotify_display_name}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {presence.album_image_url ? (
          <Image
            src={presence.album_image_url}
            alt={presence.album_name ? `${presence.album_name} のジャケット` : "Spotify album art"}
            width={compact ? 52 : 64}
            height={compact ? 52 : 64}
            className="rounded-xl border border-border/70 object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {presence.track_url ? (
            <Link
              href={presence.track_url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-1 text-sm font-medium hover:underline"
            >
              {presence.track_name}
            </Link>
          ) : (
            <p className="line-clamp-1 text-sm font-medium">{presence.track_name}</p>
          )}
          {presence.artist_name ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">{presence.artist_name}</p>
          ) : null}
          {presence.album_name ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">{presence.album_name}</p>
          ) : null}
          {playedAt ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {presence.is_playing ? `更新 ${playedAt}` : `${playedAt} に再生`}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
