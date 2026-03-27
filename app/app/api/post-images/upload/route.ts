import { NextResponse } from "next/server"

import { uploadFileToB2 } from "@/lib/backblaze-b2"
import { getSupabaseServerClient } from "@/lib/supabase/client"

async function resolveUserId(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }

  const accessToken = authHeader.slice("Bearer ".length)
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }

  return data.user.id
}

export async function POST(request: Request) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    const uploaded = await uploadFileToB2(file, userId)

    return NextResponse.json(uploaded)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

