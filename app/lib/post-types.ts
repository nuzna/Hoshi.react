import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"

export type ProfileLite = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "avatar_url"
>

export type LikeLite = Pick<Database["public"]["Tables"]["post_likes"]["Row"], "user_id">

export type ReactionLite = Pick<
  Database["public"]["Tables"]["post_reactions"]["Row"],
  "emoji" | "user_id"
>

export type PostImageLite = Pick<
  Database["public"]["Tables"]["post_images"]["Row"],
  "id" | "url" | "mime_type" | "width" | "height" | "sort_order"
>

export type RepostSource = {
  id: string
  user_id: string
  content: string | null
  has_media: boolean
  reply_to_id: string | null
  repost_of_id: string | null
  created_at: string
  profiles: ProfileLite | null
  post_images?: PostImageLite[] | null
}

export type ReplySource = {
  id: string
  user_id: string
  content: string | null
  has_media: boolean
  created_at: string
  profiles: ProfileLite | null
  post_images?: PostImageLite[] | null
}

export type TimelinePost = {
  id: string
  user_id: string
  content: string | null
  has_media: boolean
  reply_to_id: string | null
  repost_of_id: string | null
  created_at: string
  profiles: ProfileLite | null
  post_likes: LikeLite[] | null
  post_reactions: ReactionLite[] | null
  post_images: PostImageLite[] | null
  reply_to?: ReplySource | ReplySource[] | null
  repost_of?: RepostSource | RepostSource[] | null
}

export const POST_SELECT_QUERY = `
  id,
  user_id,
  content,
  has_media,
  reply_to_id,
  repost_of_id,
  created_at,
  profiles:user_id (
    id,
    username,
    display_name,
    avatar_url
  ),
  post_likes (
    user_id
  ),
  post_reactions (
    user_id,
    emoji
  ),
  post_images (
    id,
    url,
    mime_type,
    width,
    height,
    sort_order
  )
`

const POST_RELATION_SELECT_QUERY = `
  id,
  user_id,
  content,
  has_media,
  reply_to_id,
  repost_of_id,
  created_at,
  profiles:user_id (
    id,
    username,
    display_name,
    avatar_url
  ),
  post_images (
    id,
    url,
    mime_type,
    width,
    height,
    sort_order
  )
`

export function groupReactionCounts(reactions: ReactionLite[] | null) {
  const counts = new Map<string, number>()
  for (const reaction of reactions ?? []) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1)
  }
  return counts
}

export async function hydratePostsRelations(
  supabase: SupabaseClient<Database>,
  rows: TimelinePost[],
): Promise<TimelinePost[]> {
  if (rows.length === 0) return rows

  const relationIds = new Set<string>()
  for (const row of rows) {
    if (row.reply_to_id) relationIds.add(row.reply_to_id)
    if (row.repost_of_id) relationIds.add(row.repost_of_id)
  }

  if (relationIds.size === 0) {
    return rows.map((row) => ({ ...row, reply_to: null, repost_of: null }))
  }

  const { data, error } = await supabase
    .from("posts")
    .select(POST_RELATION_SELECT_QUERY)
    .in("id", Array.from(relationIds))

  if (error || !data) {
    return rows.map((row) => ({ ...row, reply_to: null, repost_of: null }))
  }

  const relationMap = new Map(data.map((row) => [row.id, row]))
  return rows.map((row) => ({
    ...row,
    reply_to: row.reply_to_id ? ((relationMap.get(row.reply_to_id) as ReplySource | undefined) ?? null) : null,
    repost_of: row.repost_of_id ? ((relationMap.get(row.repost_of_id) as RepostSource | undefined) ?? null) : null,
  }))
}

export function pickSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
