type SpotifyTokenResponse = {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  refresh_token?: string
}

type SpotifyImage = {
  url: string
}

type SpotifyArtist = {
  name: string
}

type SpotifyTrack = {
  name: string
  external_urls?: { spotify?: string }
  album?: {
    name: string
    images?: SpotifyImage[]
  }
  artists?: SpotifyArtist[]
}

type SpotifyProfileResponse = {
  id: string
  display_name?: string
  images?: SpotifyImage[]
}

type SpotifyCurrentlyPlayingResponse = {
  is_playing: boolean
  timestamp?: number
  item?: SpotifyTrack | null
}

type SpotifyRecentlyPlayedResponse = {
  items?: Array<{
    played_at: string
    track: SpotifyTrack
  }>
}

function getRequiredSpotifyEnv() {
  const clientId = process.env.SPOTIFY_CLIENT_ID ?? process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify env vars. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.")
  }

  return { clientId, clientSecret }
}

function getBasicAuthHeader() {
  const { clientId, clientSecret } = getRequiredSpotifyEnv()
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
}

async function readSpotifyError(response: Response) {
  const body = await response.text()

  if (!body) {
    return `Spotify API returned ${response.status}.`
  }

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; error_description?: string }
    return parsed.error?.message ?? parsed.error_description ?? body
  } catch {
    return body
  }
}

export function getSpotifyAuthorizeUrl(redirectUri: string, state: string) {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? process.env.SPOTIFY_CLIENT_ID

  if (!clientId) {
    throw new Error("Missing Spotify client id. Set NEXT_PUBLIC_SPOTIFY_CLIENT_ID.")
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "user-read-currently-playing user-read-recently-played",
    state,
    show_dialog: "true",
  })

  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function exchangeSpotifyCode(code: string, redirectUri: string) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(await readSpotifyError(response))
  }

  return (await response.json()) as SpotifyTokenResponse
}

export async function refreshSpotifyAccessToken(refreshToken: string) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw new Error(await readSpotifyError(response))
  }

  return (await response.json()) as SpotifyTokenResponse
}

async function spotifyApiRequest<T>(path: string, accessToken: string) {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  if (response.status === 204) {
    return null
  }

  if (!response.ok) {
    throw new Error(await readSpotifyError(response))
  }

  return (await response.json()) as T
}

export async function fetchSpotifyProfile(accessToken: string) {
  return spotifyApiRequest<SpotifyProfileResponse>("/me", accessToken)
}

export async function fetchSpotifyPlaybackSnapshot(accessToken: string) {
  const current = await spotifyApiRequest<SpotifyCurrentlyPlayingResponse>("/me/player/currently-playing", accessToken)

  if (current?.item) {
    return {
      isPlaying: Boolean(current.is_playing),
      trackName: current.item.name,
      artistName: current.item.artists?.map((artist) => artist.name).join(", ") ?? "",
      albumName: current.item.album?.name ?? "",
      albumImageUrl: current.item.album?.images?.[0]?.url ?? null,
      trackUrl: current.item.external_urls?.spotify ?? null,
      playedAt: current.timestamp ? new Date(current.timestamp).toISOString() : new Date().toISOString(),
    }
  }

  const recent = await spotifyApiRequest<SpotifyRecentlyPlayedResponse>("/me/player/recently-played?limit=1", accessToken)
  const latest = recent?.items?.[0]

  if (!latest?.track) {
    return {
      isPlaying: false,
      trackName: null,
      artistName: null,
      albumName: null,
      albumImageUrl: null,
      trackUrl: null,
      playedAt: null,
    }
  }

  return {
    isPlaying: false,
    trackName: latest.track.name,
    artistName: latest.track.artists?.map((artist) => artist.name).join(", ") ?? "",
    albumName: latest.track.album?.name ?? "",
    albumImageUrl: latest.track.album?.images?.[0]?.url ?? null,
    trackUrl: latest.track.external_urls?.spotify ?? null,
    playedAt: latest.played_at ?? null,
  }
}
