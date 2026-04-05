import { NextResponse } from "next/server"

import { resolveAuthorizedUser } from "@/lib/api-auth"
import { fetchSpotifyPlaybackSnapshot, fetchSpotifyProfile, refreshSpotifyAccessToken } from "@/lib/spotify"
import { getSupabaseAdminClient } from "@/lib/supabase/client"

export async function POST(request: Request) {
  try {
    const authorized = await resolveAuthorizedUser(request)
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getSupabaseAdminClient()
    const { data: connection, error: connectionError } = await supabase
      .from("spotify_connections")
      .select("*")
      .eq("user_id", authorized.user.id)
      .maybeSingle()

    if (connectionError) throw connectionError
    if (!connection) {
      return NextResponse.json({ error: "Spotify is not connected" }, { status: 404 })
    }

    let accessToken = connection.access_token
    let refreshToken = connection.refresh_token
    let expiresAt = connection.access_token_expires_at

    if (new Date(expiresAt).getTime() <= Date.now() + 60_000) {
      const refreshed = await refreshSpotifyAccessToken(refreshToken)
      accessToken = refreshed.access_token
      refreshToken = refreshed.refresh_token ?? refreshToken
      expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

      const { error: refreshError } = await supabase
        .from("spotify_connections")
        .update({
          access_token: accessToken,
          refresh_token: refreshToken,
          scopes: refreshed.scope,
          access_token_expires_at: expiresAt,
        })
        .eq("user_id", authorized.user.id)

      if (refreshError) throw refreshError
    }

    const [spotifyProfile, playback] = await Promise.all([
      fetchSpotifyProfile(accessToken),
      fetchSpotifyPlaybackSnapshot(accessToken),
    ])

    const payload = {
      user_id: authorized.user.id,
      spotify_display_name: spotifyProfile?.display_name ?? connection.spotify_display_name ?? null,
      spotify_avatar_url: spotifyProfile?.images?.[0]?.url ?? connection.spotify_avatar_url ?? null,
      is_connected: true,
      is_playing: playback.isPlaying,
      track_name: playback.trackName,
      artist_name: playback.artistName,
      album_name: playback.albumName,
      album_image_url: playback.albumImageUrl,
      track_url: playback.trackUrl,
      played_at: playback.playedAt,
    }

    const { error: cacheError } = await supabase.from("spotify_presence_cache").upsert(payload)
    if (cacheError) throw cacheError

    const { error: profileError } = await supabase
      .from("spotify_connections")
      .update({
        spotify_display_name: payload.spotify_display_name,
        spotify_avatar_url: payload.spotify_avatar_url,
        access_token: accessToken,
        refresh_token: refreshToken,
        access_token_expires_at: expiresAt,
      })
      .eq("user_id", authorized.user.id)

    if (profileError) throw profileError

    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify sync failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
