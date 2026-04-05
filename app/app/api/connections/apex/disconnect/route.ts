import { NextResponse } from "next/server"

import { resolveAuthorizedUser } from "@/lib/api-auth"
import { getSupabaseAuthedServerClient } from "@/lib/supabase/client"

export async function POST(request: Request) {
  try {
    const authorized = await resolveAuthorizedUser(request)
    if (!authorized) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 })
    }

    const supabase = getSupabaseAuthedServerClient(authorized.accessToken)
    const [{ error: connectionError }, { error: cacheError }] = await Promise.all([
      supabase.from("apex_connections").delete().eq("user_id", authorized.user.id),
      supabase.from("apex_profile_cache").delete().eq("user_id", authorized.user.id),
    ])

    if (connectionError || cacheError) {
      throw new Error(connectionError?.message ?? cacheError?.message ?? "Apex 接続の解除に失敗しました。")
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apex 接続の解除に失敗しました。"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
