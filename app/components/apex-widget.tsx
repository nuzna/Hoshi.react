"use client"

import type { Database } from "@/lib/supabase/types"

type ApexProfileCache = Database["public"]["Tables"]["apex_profile_cache"]["Row"]

type ApexWidgetProps = {
  profile: ApexProfileCache
  compact?: boolean
}

function formatNumber(value: number | null) {
  if (typeof value !== "number") return "-"
  return new Intl.NumberFormat("ja-JP").format(value)
}

const platformLabels: Record<string, string> = {
  PC: "PC",
  PS4: "PlayStation",
  SWICH: "Nintendo Switch",
  X1: "Xbox",
}

export function ApexWidget({ profile, compact = false }: ApexWidgetProps) {
  return (
    <div className={`rounded-3xl border border-border/80 bg-muted/10 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={`${profile.player_name} のApexアイコン`}
              className={`${compact ? "size-11" : "size-14"} rounded-2xl border border-border/70 object-cover`}
            />
          ) : (
            <div
              className={`${compact ? "size-11 text-xs" : "size-14 text-sm"} flex items-center justify-center rounded-2xl border border-border/70 bg-muted/30 font-semibold text-muted-foreground`}
            >
              APEX
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile.player_name}</p>
            <p className="text-xs text-muted-foreground">{platformLabels[profile.platform] ?? profile.platform}</p>
            {profile.selected_legend ? (
              <p className="mt-1 text-xs text-muted-foreground">使用レジェンド: {profile.selected_legend}</p>
            ) : null}
          </div>
        </div>

        {profile.tracker_url ? (
          <a
            href={profile.tracker_url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-border/70 px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
          >
            Tracker
          </a>
        ) : null}
      </div>

      {profile.selected_legend_image_url && !compact ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-background/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.selected_legend_image_url}
            alt={profile.selected_legend ? `${profile.selected_legend} の画像` : "Apex legend"}
            className="h-32 w-full object-cover"
          />
        </div>
      ) : null}

      <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        <div className="rounded-2xl border border-border/70 bg-background/60 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Level</p>
          <p className="mt-1 text-sm font-semibold">{formatNumber(profile.level)}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/60 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rank</p>
          <p className="mt-1 truncate text-sm font-semibold">{profile.rank_name ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/60 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Kills</p>
          <p className="mt-1 text-sm font-semibold">{formatNumber(profile.kills)}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/60 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Damage</p>
          <p className="mt-1 text-sm font-semibold">{formatNumber(profile.damage)}</p>
        </div>
      </div>

      {profile.rank_score !== null ? (
        <p className="mt-3 text-xs text-muted-foreground">RP: {formatNumber(profile.rank_score)}</p>
      ) : null}
    </div>
  )
}
