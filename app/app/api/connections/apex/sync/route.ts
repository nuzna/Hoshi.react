import { NextResponse } from "next/server"

import { resolveAuthorizedUser } from "@/lib/api-auth"
import { fetchApexTrackerProfile, type ApexTrackerPlatform } from "@/lib/apex-tracker"
import { getSupabaseAuthedServerClient } from "@/lib/supabase/client"

function isValidPlatform(value: string): value is ApexTrackerPlatform {
  return value === "PC" || value === "PS4" || value === "SWICH" || value === "X1"
}

export async function POST(request: Request) {
  try {
    const authorized = await resolveAuthorizedUser(request)
    if (!authorized) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { platform?: string; playerName?: string } | null
    const platform = body?.platform?.trim() ?? ""
    const playerName = body?.playerName?.trim() ?? ""

    if (!isValidPlatform(platform)) {
      return NextResponse.json({ error: "対応しているプラットフォームを選択してください。" }, { status: 400 })
    }

    if (!playerName) {
      return NextResponse.json({ error: "プレイヤー名を入力してください。" }, { status: 400 })
    }

    const snapshot = await fetchApexTrackerProfile(platform, playerName)
    const supabase = getSupabaseAuthedServerClient(authorized.accessToken)
    const cachePayload = {
      user_id: authorized.user.id,
      platform: snapshot.platform,
      player_name: snapshot.playerName,
      tracker_url: snapshot.trackerUrl,
      avatar_url: snapshot.avatarUrl,
      level: snapshot.level,
      rank_name: snapshot.rankName,
      rank_score: snapshot.rankScore,
      rank_icon_url: snapshot.rankIconUrl,
      selected_legend: snapshot.selectedLegend,
      selected_legend_image_url: snapshot.selectedLegendImageUrl,
      kills: snapshot.kills,
      damage: snapshot.damage,
    }

    const [{ error: connectionError }, { error: cacheError }] = await Promise.all([
      supabase.from("apex_connections").upsert({
        user_id: authorized.user.id,
        platform: snapshot.platform,
        player_name: snapshot.playerName,
      }),
      supabase.from("apex_profile_cache").upsert(cachePayload),
    ])

    if (connectionError || cacheError) {
      throw new Error(connectionError?.message ?? cacheError?.message ?? "Apex 情報の保存に失敗しました。")
    }

    return NextResponse.json(cachePayload)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apex 情報の同期に失敗しました。"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
