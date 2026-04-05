type TrackerApiStat = {
  displayValue?: string
  value?: number
  metadata?: {
    iconUrl?: string
    rankName?: string
  }
}

type TrackerApiSegment = {
  type?: string
  metadata?: {
    name?: string
    imageUrl?: string
    portraitImageUrl?: string
    legendName?: string
    isActive?: boolean
  }
  stats?: Record<string, TrackerApiStat | undefined>
}

type TrackerApiResponse = {
  data?: {
    platformInfo?: {
      avatarUrl?: string
      platformUserHandle?: string
      platformUserIdentifier?: string
      platformUserUrl?: string
    }
    metadata?: {
      activeLegendName?: string
      activeLegendImageUrl?: string
    }
    segments?: TrackerApiSegment[]
  }
  errors?: Array<{
    code?: string
    message?: string
  }>
}

export type ApexTrackerPlatform = "origin" | "psn" | "xbl"

export type ApexTrackerSnapshot = {
  platform: ApexTrackerPlatform
  playerName: string
  trackerUrl: string | null
  avatarUrl: string | null
  level: number | null
  rankName: string | null
  rankScore: number | null
  rankIconUrl: string | null
  selectedLegend: string | null
  selectedLegendImageUrl: string | null
  kills: number | null
  damage: number | null
}

function getTrackerApiKey() {
  const apiKey = process.env.TRN_API_KEY
  if (!apiKey) {
    throw new Error("TRN_API_KEY が設定されていません。")
  }
  return apiKey
}

function readStatValue(segment: TrackerApiSegment | null, key: string) {
  const stat = segment?.stats?.[key]
  if (!stat) return null
  return typeof stat.value === "number" ? Math.round(stat.value) : null
}

function parseTrackerError(response: Response, payload: TrackerApiResponse | null) {
  const message = payload?.errors?.[0]?.message
  if (response.status === 404) {
    return "Apex のプロフィールが見つかりません。プラットフォームとプレイヤー名を確認してください。"
  }
  if (response.status === 401 || response.status === 403) {
    return message ?? "Tracker Network API の認証に失敗しました。API キーや利用権限を確認してください。"
  }
  return message ?? `Tracker Network API が ${response.status} を返しました。`
}

export async function fetchApexTrackerProfile(platform: ApexTrackerPlatform, playerName: string) {
  const apiKey = getTrackerApiKey()
  const encodedPlayerName = encodeURIComponent(playerName)
  const response = await fetch(`https://public-api.tracker.gg/v2/apex/standard/profile/${platform}/${encodedPlayerName}`, {
    headers: {
      Accept: "application/json",
      "TRN-Api-Key": apiKey,
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as TrackerApiResponse | null
  if (!response.ok) {
    throw new Error(parseTrackerError(response, payload))
  }

  const data = payload?.data
  if (!data) {
    throw new Error("Tracker Network API から Apex データを取得できませんでした。")
  }

  const segments = Array.isArray(data.segments) ? data.segments : []
  const overviewSegment = segments[0] ?? null
  const activeLegendSegment =
    segments.find((segment) => segment.type === "legend" && segment.metadata?.isActive) ??
    segments.find((segment) => segment.type === "legend")

  const rankStat = overviewSegment?.stats?.rankScore

  return {
    platform,
    playerName: data.platformInfo?.platformUserHandle ?? data.platformInfo?.platformUserIdentifier ?? playerName,
    trackerUrl:
      data.platformInfo?.platformUserUrl ??
      `https://tracker.gg/apex/profile/${platform}/${encodedPlayerName}/overview`,
    avatarUrl: data.platformInfo?.avatarUrl ?? null,
    level: readStatValue(overviewSegment, "level"),
    rankName:
      rankStat?.metadata?.rankName ??
      overviewSegment?.stats?.rankName?.displayValue ??
      overviewSegment?.stats?.rankName?.metadata?.rankName ??
      null,
    rankScore: typeof rankStat?.value === "number" ? Math.round(rankStat.value) : null,
    rankIconUrl: rankStat?.metadata?.iconUrl ?? null,
    selectedLegend:
      data.metadata?.activeLegendName ??
      activeLegendSegment?.metadata?.legendName ??
      activeLegendSegment?.metadata?.name ??
      null,
    selectedLegendImageUrl:
      data.metadata?.activeLegendImageUrl ??
      activeLegendSegment?.metadata?.imageUrl ??
      activeLegendSegment?.metadata?.portraitImageUrl ??
      null,
    kills: readStatValue(overviewSegment, "kills"),
    damage: readStatValue(overviewSegment, "damage"),
  } satisfies ApexTrackerSnapshot
}
