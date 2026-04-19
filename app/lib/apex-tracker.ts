type ApexTrackerValue = {
  value?: number
}

type ApexTrackerLegend = {
  LegendName?: string
  data?: Array<{
    key?: string
    name?: string
    value?: number
  }>
  ImgAssets?: {
    icon?: string
    banner?: string
  }
}

type ApexLegendsStatusResponse = {
  Error?: string
  global?: {
    name?: string
    avatar?: string
    level?: number
    rank?: {
      rankName?: string
      rankScore?: number
      rankImg?: string
    }
  }
  total?: {
    kills?: ApexTrackerValue
    damage?: ApexTrackerValue
  }
  legends?: {
    selected?: ApexTrackerLegend
  }
}

export type ApexTrackerPlatform = "PC" | "PS4" | "SWICH" | "X1"

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

function getAlsApiKey() {
  const apiKey = process.env.ALS_API_KEY
  if (!apiKey) {
    throw new Error("ALS_API_KEY が設定されていません。")
  }
  return apiKey
}

function getLegendStatValue(legend: ApexTrackerLegend | undefined, keys: string[]) {
  const items = Array.isArray(legend?.data) ? legend.data : []
  for (const item of items) {
    if (!item) continue
    const loweredName = item.name?.toLowerCase()
    if ((item.key && keys.includes(item.key)) || (loweredName && keys.includes(loweredName))) {
      return typeof item.value === "number" ? Math.round(item.value) : null
    }
  }
  return null
}

function parseAlsError(status: number, payload: ApexLegendsStatusResponse | null, rawText: string) {
  const message = payload?.Error ?? rawText.trim()
  if (status === 403) {
    return message || "API の認証に失敗しました。API キーを確認してください。"
  }
  if (status === 404) {
    return "Apex のプロフィールが見つかりません。プラットフォームとプレイヤー名を確認してください。"
  }
  if (status === 406) {
    return message || "API がこのリクエストを受け付けませんでした。URL や player/platform の組み合わせを確認してください。"
  }
  if (status === 410) {
    return "API がプラットフォームを受け付けませんでした。"
  }
  if (status === 429) {
    return "API のレート制限に達しました。少し時間を置いて再試行してください。"
  }
  return message || `API が ${status} を返しました。`
}

export async function fetchApexTrackerProfile(platform: ApexTrackerPlatform, playerName: string) {
  const apiKey = getAlsApiKey()
  const encodedPlayerName = encodeURIComponent(playerName)
  const url = `https://api.mozambiquehe.re/bridge?auth=${encodeURIComponent(apiKey)}&player=${encodedPlayerName}&platform=${platform}`

  const response = await fetch(url, {
    cache: "no-store",
  })

  const rawText = await response.text()
  let payload: ApexLegendsStatusResponse | null = null
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as ApexLegendsStatusResponse
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new Error(parseAlsError(response.status, payload, rawText))
  }

  if (!payload?.global) {
    throw new Error("API から Apex データを取得できませんでした。")
  }

  const selectedLegend = payload.legends?.selected

  return {
    platform,
    playerName: payload.global.name ?? playerName,
    trackerUrl: `https://apexlegendsstatus.com/profile/${platform}/${encodedPlayerName}`,
    avatarUrl: payload.global.avatar ?? null,
    level: typeof payload.global.level === "number" ? Math.round(payload.global.level) : null,
    rankName: payload.global.rank?.rankName ?? null,
    rankScore: typeof payload.global.rank?.rankScore === "number" ? Math.round(payload.global.rank.rankScore) : null,
    rankIconUrl: payload.global.rank?.rankImg ?? null,
    selectedLegend: selectedLegend?.LegendName ?? null,
    selectedLegendImageUrl: selectedLegend?.ImgAssets?.banner ?? selectedLegend?.ImgAssets?.icon ?? null,
    kills:
      getLegendStatValue(selectedLegend, ["kills"]) ??
      (typeof payload.total?.kills?.value === "number" ? Math.round(payload.total.kills.value) : null),
    damage:
      getLegendStatValue(selectedLegend, ["damage"]) ??
      (typeof payload.total?.damage?.value === "number" ? Math.round(payload.total.damage.value) : null),
  } satisfies ApexTrackerSnapshot
}
