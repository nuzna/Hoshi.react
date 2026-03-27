import { NextResponse } from "next/server"

import { deleteFileFromB2 } from "@/lib/backblaze-b2"
import { getSupabaseServerClient } from "@/lib/supabase/client"

function getSupabaseRestEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase env is not configured.")
  }

  return { supabaseUrl, supabaseAnonKey }
}

async function resolveAccessToken(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }
  return authHeader.slice("Bearer ".length)
}

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

async function fetchRest<T>(path: string, accessToken: string, init?: RequestInit) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseRestEnv()
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || "Supabase REST request failed.")
  }

  if (response.status === 204) {
    return null as T
  }

  return (await response.json()) as T
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const accessToken = await resolveAccessToken(request)
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params
    const posts = await fetchRest<Array<{ id: string; user_id: string }>>(
      `posts?id=eq.${encodeURIComponent(id)}&select=id,user_id`,
      accessToken,
    )
    const post = posts[0]

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    if (post.user_id !== data.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const images = await fetchRest<Array<{ storage_key: string }>>(
      `post_images?post_id=eq.${encodeURIComponent(id)}&select=storage_key`,
      accessToken,
    )

    for (const image of images) {
      await deleteFileFromB2(image.storage_key)
    }

    await fetchRest<null>(`posts?id=eq.${encodeURIComponent(id)}`, accessToken, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Post delete failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}