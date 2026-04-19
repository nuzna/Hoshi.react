import type { SupabaseClient } from "@supabase/supabase-js"

import { guildFeatureEnabled } from "@/lib/guild-config"
import { pickSingleRelation, type TimelinePost } from "@/lib/post-types"
import type { Database } from "@/lib/supabase/types"

export type GuildDisplay = {
  guildName: string
  tag: string
  symbol: string
}

export type GuildSummary = Pick<
  Database["public"]["Tables"]["guilds"]["Row"],
  "id" | "name" | "tag" | "symbol" | "owner_id" | "created_at"
>

export type GuildMemberProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "avatar_url" | "display_font"
>

export type GuildMemberRow = Database["public"]["Tables"]["guild_members"]["Row"] & {
  profiles?: GuildMemberProfile | GuildMemberProfile[] | null
}

export type GuildJoinRequestRow = Database["public"]["Tables"]["guild_join_requests"]["Row"] & {
  profiles?: GuildMemberProfile | GuildMemberProfile[] | null
}

export type GuildMembershipWithGuild = Database["public"]["Tables"]["guild_members"]["Row"] & {
  guilds?: GuildSummary | GuildSummary[] | null
}

export function getSingleGuild<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export function collectPostUserIds(posts: TimelinePost[]) {
  const ids = new Set<string>()

  for (const post of posts) {
    ids.add(post.user_id)

    const replySource = pickSingleRelation(post.reply_to)
    if (replySource?.user_id) ids.add(replySource.user_id)

    const repostSource = pickSingleRelation(post.repost_of)
    if (repostSource?.user_id) ids.add(repostSource.user_id)
  }

  return Array.from(ids)
}

export async function fetchGuildDisplayMap(
  supabase: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, GuildDisplay>> {
  if (!guildFeatureEnabled || userIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from("guild_members")
    .select("user_id, guilds:guild_id(name, tag, symbol)")
    .in("user_id", userIds)

  if (error) throw error

  const map = new Map<string, GuildDisplay>()

  for (const row of (data ?? []) as Array<{
    user_id: string
    guilds?: { name: string; tag: string; symbol: string } | { name: string; tag: string; symbol: string }[] | null
  }>) {
    const guild = Array.isArray(row.guilds) ? row.guilds[0] : row.guilds
    if (!guild) continue
    map.set(row.user_id, {
      guildName: guild.name,
      tag: guild.tag,
      symbol: guild.symbol,
    })
  }

  return map
}

export async function fetchCurrentUserGuild(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GuildMembershipWithGuild | null> {
  if (!guildFeatureEnabled) return null

  const { data, error } = await supabase
    .from("guild_members")
    .select("user_id, guild_id, role, joined_at, guilds:guild_id(id, name, tag, symbol, owner_id, created_at)")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error

  return (data ?? null) as GuildMembershipWithGuild | null
}
