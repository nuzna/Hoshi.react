import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"

let browserClient: SupabaseClient<Database> | undefined

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }

  const noOpLock = async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn()

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Prevent Browser LockManager contention ("Lock broken by ... steal").
      lock: noOpLock,
    },
  })
  browserClient = client
  return client
}
