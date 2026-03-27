import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"

let browserClient: SupabaseClient<Database> | undefined

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }

  return { supabaseUrl, supabaseAnonKey }
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()

  const noOpLock = async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn()
  const timedFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)

    try {
      const response = await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      })
      return response
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("認証サーバーの応答がタイムアウトしました。時間をおいて再試行してください。")
      }
      throw error
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      lock: noOpLock,
    },
    global: {
      fetch: timedFetch,
    },
  })
  browserClient = client
  return client
}

export function getSupabaseServerClient(): SupabaseClient<Database> {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
