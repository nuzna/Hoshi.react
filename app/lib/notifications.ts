import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"

export type NotificationType = "like" | "reaction" | "follow" | "reply"

type BaseNotificationPayload = {
  supabase: SupabaseClient<Database>
  recipientId: string
  actorId: string
  type: NotificationType
}

type NotificationPayload = BaseNotificationPayload & {
  postId?: string | null
  reactionEmoji?: string | null
}

function buildOnConflict(type: NotificationType) {
  if (type === "follow") return "recipient_id,actor_id,type"
  if (type === "like" || type === "reply") return "recipient_id,actor_id,type,post_id"
  return "recipient_id,actor_id,type,post_id,reaction_emoji"
}

export async function upsertNotification({
  supabase,
  recipientId,
  actorId,
  type,
  postId = null,
  reactionEmoji = null,
}: NotificationPayload) {
  if (recipientId === actorId) return

  const payload = {
    recipient_id: recipientId,
    actor_id: actorId,
    type,
    post_id: postId,
    reaction_emoji: reactionEmoji,
    is_read: false,
  }

  const { error } = await supabase
    .from("notifications")
    .upsert(payload, { onConflict: buildOnConflict(type) })

  if (error) throw error
}

export async function deleteNotification({
  supabase,
  recipientId,
  actorId,
  type,
  postId = null,
  reactionEmoji = null,
}: NotificationPayload) {
  let query = supabase
    .from("notifications")
    .delete()
    .eq("recipient_id", recipientId)
    .eq("actor_id", actorId)
    .eq("type", type)

  if (type === "follow") {
    query = query.is("post_id", null).is("reaction_emoji", null)
  }
  if (type === "like" || type === "reply") {
    if (!postId) return
    query = query.eq("post_id", postId)
  }
  if (type === "reaction") {
    if (!postId || !reactionEmoji) return
    query = query.eq("post_id", postId).eq("reaction_emoji", reactionEmoji)
  }

  const { error } = await query
  if (error) throw error
}
