import { NextResponse } from "next/server"

import { resolveAuthorizedUser } from "@/lib/api-auth"
import { exchangeSpotifyCode, fetchSpotifyPlaybackSnapshot, fetchSpotifyProfile } from "@/lib/spotify"
import { getSupabaseAdminClient } from "@/lib/supabase/client"

export async function POST(request: Request) {
  try {
    const authorized = await resolveAuthorizedUser(request)
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { code, redirectUri } = (await request.json()) as {
      code?: string
      redirectUri?: string
    }

    if (!code || !redirectUri) {
      return NextResponse.json({ error: "code and redirectUri are required" }, { status: 400 })
    }

    const token = await exchangeSpotifyCode(code, redirectUri)
    const [spotifyProfile, playback] = await Promise.all([
      fetchSpotifyProfile(token.access_token),
      fetchSpotifyPlaybackSnapshot(token.access_token),
    ])

    if (!spotifyProfile?.id || !token.refresh_token) {
      return NextResponse.json({ error: "Spotify profile or refresh token is missing" }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()

    const { error: connectionError } = await supabase.from("spotify_connections").upsert({
      user_id: authorized.user.id,
      spotify_user_id: spotifyProfile.id,
      spotify_display_name: spotifyProfile.display_name ?? null,
      spotify_avatar_url: spotifyProfile.images?.[0]?.url ?? null,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      scopes: token.scope,
      access_token_expires_at: expiresAt,
    })

    if (connectionError) {
      throw connectionError
    }

    const { error: cacheError } = await supabase.from("spotify_presence_cache").upsert({
      user_id: authorized.user.id,
      spotify_display_name: spotifyProfile.display_name ?? null,
      spotify_avatar_url: spotifyProfile.images?.[0]?.url ?? null,
      is_connected: true,
      is_playing: playback.isPlaying,
      track_name: playback.trackName,
      artist_name: playback.artistName,
      album_name: playback.albumName,
      album_image_url: playback.albumImageUrl,
      track_url: playback.trackUrl,
      played_at: playback.playedAt,
    })

    if (cacheError) {
      throw cacheError
    }

    return NextResponse.json({
      connected: true,
      spotifyDisplayName: spotifyProfile.display_name ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify connection failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
