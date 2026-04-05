import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"

export async function fetchPublicAdminUserIds(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from("admin_users").select("user_id")

  if (error) throw error

  return new Set((data ?? []).map((row) => row.user_id))
}
