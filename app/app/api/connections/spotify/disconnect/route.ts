import { NextResponse } from "next/server"

import { resolveAuthorizedUser } from "@/lib/api-auth"
import { getSupabaseAdminClient } from "@/lib/supabase/client"

export async function POST(request: Request) {
  try {
    const authorized = await resolveAuthorizedUser(request)
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getSupabaseAdminClient()

    const [{ error: connectionError }, { error: cacheError }] = await Promise.all([
      supabase.from("spotify_connections").delete().eq("user_id", authorized.user.id),
      supabase.from("spotify_presence_cache").delete().eq("user_id", authorized.user.id),
    ])

    if (connectionError) throw connectionError
    if (cacheError) throw cacheError

    return NextResponse.json({ disconnected: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify disconnect failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
