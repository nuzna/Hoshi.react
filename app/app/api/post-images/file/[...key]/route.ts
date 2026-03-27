import { NextResponse } from "next/server"

import { downloadFileFromB2 } from "@/lib/backblaze-b2"

type RouteContext = {
  params: Promise<{
    key?: string[]
  }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key } = await context.params
    const fileName = (key ?? []).map((segment) => decodeURIComponent(segment)).join("/")

    if (!fileName) {
      return NextResponse.json({ error: "File key is required" }, { status: 400 })
    }

    const b2Response = await downloadFileFromB2(fileName)
    const arrayBuffer = await b2Response.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": b2Response.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image fetch failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
