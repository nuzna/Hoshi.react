import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"

export type AchievementRarity = "diamond" | "gold" | "silver" | "bronze"
export type AchievementMetric = 
  "posts_count" |
  "followers_count" |
  "likes_received_count" |
  "reactions_received_count" |
  "unfollows_count" |
  "max_post_length" |
  "deleted_posts_count" |
  "days_since_signup" |
  "keyword_post_count"

export type AchievementCondition = {
  metric: AchievementMetric
  gte: number
  keyword?: string
}

export type AchievementDefinition = {
  id: string
  emoji: string
  name: string
  description: string
  rarity: AchievementRarity
  condition: AchievementCondition
}

export type AchievementStats = {
  posts_count: number
  followers_count: number
  likes_received_count: number
  reactions_received_count: number
  unfollows_count: number
  max_post_length: number
  deleted_posts_count: number
  days_since_signup: number
  keyword_post_counts: Record<string, number>
}

export type ResolvedAchievement = AchievementDefinition & {
  currentValue: number
  isUnlocked: boolean
}

// Edit this array to create achievements and their unlock conditions.
export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
    {
    id: "Welcome",
    emoji: "🚀",
    name: "歓迎",
    description: "ユーザーとして登録する",
    rarity: "bronze",
    condition: { metric: "posts_count", gte: 0 },
  },
  {
    id: "LOM",
    emoji: "📝",
    name: "ROM専卒業",
    description: "初めての投稿をする",
    rarity: "bronze",
    condition: { metric: "posts_count", gte: 1 },
  },
  {
    id: "will_go_viral",
    emoji: "🔥",
    name: "炎上予備軍",
    description: "ユーザーに10回いいねされる",
    rarity: "bronze",
    condition: { metric: "likes_received_count", gte: 10 },
  },
  {
    id: "unfollow_10",
    emoji: "👥",
    name: "お前もう船降りろ",
    description: "10回フォロー整理をする",
    rarity: "silver",
    condition: { metric: "unfollows_count", gte: 10 },
  },
  {
    id: "long_text_300",
    emoji: "✍️",
    name: "長文失礼します",
    description: "文字数が300文字以上の投稿を作成",
    rarity: "silver",
    condition: { metric: "max_post_length", gte: 300 },
  },
  {
    id: "kurorekishi",
    emoji: "📓",
    name: "黒歴史製造機",
    description: "累計投稿削除数が10以上",
    rarity: "silver",
    condition: { metric: "deleted_posts_count", gte: 10 },
  },
  {
    id: "3_bouzu",
    emoji: "📅",
    name: "3日坊主",
    description: "登録してから3日経過する",
    rarity: "silver",
    condition: { metric: "days_since_signup", gte: 3 },
  },
  {
    id: "uo_mania",
    emoji: "🤓",
    name: "冷笑マニア",
    description: "「うお」を含む投稿を5回以上",
    rarity: "gold",
    condition: { metric: "keyword_post_count", gte: 5, keyword: "うお" },
  },
]

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase()
}

function getCurrentValue(stats: AchievementStats, condition: AchievementCondition) {
  if (condition.metric === "keyword_post_count") {
    const keyword = condition.keyword ? normalizeKeyword(condition.keyword) : ""
    if (!keyword) return 0
    return stats.keyword_post_counts[keyword] ?? 0
  }
  return stats[condition.metric]
}

export function resolveAchievements(
  stats: AchievementStats,
  definitions: AchievementDefinition[] = ACHIEVEMENT_DEFINITIONS,
): ResolvedAchievement[] {
  return definitions.map((definition) => {
    const currentValue = getCurrentValue(stats, definition.condition)
    return {
      ...definition,
      currentValue,
      isUnlocked: currentValue >= definition.condition.gte,
    }
  })
}

function escapeLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
}

export async function fetchAchievementStats(
  supabase: SupabaseClient<Database>,
  userId: string,
  definitions: AchievementDefinition[] = ACHIEVEMENT_DEFINITIONS,
): Promise<AchievementStats> {
  const keywordList = Array.from(
    new Set(
      definitions
        .filter((definition) => definition.condition.metric === "keyword_post_count" && definition.condition.keyword)
        .map((definition) => normalizeKeyword(definition.condition.keyword ?? "")),
    ),
  ).filter((keyword) => keyword.length > 0)

  const postsCountQuery = supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)

  const followersCountQuery = supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId)

  const likesReceivedCountQuery = supabase
    .from("post_likes")
    .select("post_id, posts!inner(user_id)", { count: "exact", head: true })
    .eq("posts.user_id", userId)

  const reactionsReceivedCountQuery = supabase
    .from("post_reactions")
    .select("post_id, posts!inner(user_id)", { count: "exact", head: true })
    .eq("posts.user_id", userId)

  const unfollowsCountQuery = supabase
    .from("follow_history")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId)
    .eq("action", "unfollow")

  const deletedPostsCountQuery = supabase
    .from("deleted_post_history")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)

  const postsContentQuery = supabase
    .from("posts")
    .select("content")
    .eq("user_id", userId)

  const profileCreatedAtQuery = supabase
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle()

  const keywordQueries = keywordList.map((keyword) =>
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .ilike("content", `%${escapeLikePattern(keyword)}%`)
  )

  const [
    postsCountResult,
    followersCountResult,
    likesCountResult,
    reactionsCountResult,
    unfollowsCountResult,
    deletedPostsCountResult,
    postsContentResult,
    profileCreatedAtResult,
    ...keywordCountResults
  ] = await Promise.all([
    postsCountQuery,
    followersCountQuery,
    likesReceivedCountQuery,
    reactionsReceivedCountQuery,
    unfollowsCountQuery,
    deletedPostsCountQuery,
    postsContentQuery,
    profileCreatedAtQuery,
    ...keywordQueries,
  ])

  const firstError =
    postsCountResult.error ??
    followersCountResult.error ??
    likesCountResult.error ??
    reactionsCountResult.error ??
    unfollowsCountResult.error ??
    deletedPostsCountResult.error ??
    postsContentResult.error ??
    profileCreatedAtResult.error ??
    keywordCountResults.find((result) => result.error)?.error

  if (firstError) throw firstError

  const maxPostLength = (postsContentResult.data ?? []).reduce((max, row) => {
    const length = (row.content ?? "").length
    return length > max ? length : max
  }, 0)

  const createdAt = profileCreatedAtResult.data?.created_at ? new Date(profileCreatedAtResult.data.created_at) : null
  const daysSinceSignup = createdAt ? Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)) : 0

  const keywordPostCounts: Record<string, number> = {}
  keywordCountResults.forEach((result, index) => {
    keywordPostCounts[keywordList[index]] = result.count ?? 0
  })

  return {
    posts_count: postsCountResult.count ?? 0,
    followers_count: followersCountResult.count ?? 0,
    likes_received_count: likesCountResult.count ?? 0,
    reactions_received_count: reactionsCountResult.count ?? 0,
    unfollows_count: unfollowsCountResult.count ?? 0,
    max_post_length: maxPostLength,
    deleted_posts_count: deletedPostsCountResult.count ?? 0,
    days_since_signup: daysSinceSignup,
    keyword_post_counts: keywordPostCounts,
  }
}

export async function persistUnlockedAchievements(
  supabase: SupabaseClient<Database>,
  userId: string,
  resolvedAchievements: ResolvedAchievement[],
) {
  const unlocked = resolvedAchievements.filter((achievement) => achievement.isUnlocked)
  if (unlocked.length === 0) return

  const unlockIds = unlocked.map((achievement) => achievement.id)
  const { data: existingRows, error: existingError } = await supabase
    .from("profile_achievements")
    .select("achievement_id")
    .eq("user_id", userId)
    .in("achievement_id", unlockIds)

  if (existingError) throw existingError

  const existingIds = new Set(
    (existingRows ?? [])
      .map((row) => row.achievement_id)
      .filter((achievementId): achievementId is string => Boolean(achievementId)),
  )

  const insertRows = unlocked
    .filter((achievement) => !existingIds.has(achievement.id))
    .map((achievement) => ({
      user_id: userId,
      achievement_id: achievement.id,
      title: achievement.name,
      description: achievement.description,
      emoji: achievement.emoji,
      rarity: achievement.rarity,
    }))

  if (insertRows.length === 0) return

  const { error: insertError } = await supabase.from("profile_achievements").insert(insertRows)
  if (insertError) throw insertError
}
