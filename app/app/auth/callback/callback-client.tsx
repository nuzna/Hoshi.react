"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

function sanitizeNext(nextPath: string | null) {
  if (!nextPath) return "/"
  if (!nextPath.startsWith("/")) return "/"
  return nextPath
}

function normalizeDiscordUsername(value: string | null | undefined) {
  if (!value) return null

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20)

  if (normalized.length >= 3) {
    return normalized
  }

  const fallback = `user${Math.random().toString(36).slice(2, 10)}`.slice(0, 20)
  return fallback.length >= 3 ? fallback : "user001"
}

function isDiscordHostedAvatar(url: string | null | undefined) {
  return typeof url === "string" && url.includes("cdn.discordapp.com/")
}

async function getAvailableUsername(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  baseUsername: string,
  profileId: string
) {
  let candidate = baseUsername

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle()

    if (!existingProfile || existingProfile.id === profileId) {
      return candidate
    }

    const suffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    candidate = `${baseUsername.slice(0, 15)}_${suffix}`
  }

  return `${baseUsername.slice(0, 15)}_${Date.now().toString().slice(-4)}`
}

export function AuthCallbackClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      const supabase = getSupabaseBrowserClient()
      const code = searchParams.get("code")
      const nextPath = sanitizeNext(searchParams.get("next"))

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError(exchangeError.message)
          return
        }
      }

      const { data } = await supabase.auth.getUser()
      const user = data.user

      if (user) {
        const identities = user.identities ?? []
        const discordIdentity = identities.find((identity) => identity.provider === "discord")
        const identityData = (discordIdentity?.identity_data ?? {}) as Record<string, unknown>

        const discordId =
          (identityData.id as string | undefined) ??
          (user.user_metadata?.provider_id as string | undefined) ??
          (user.user_metadata?.sub as string | undefined) ??
          null
        const discordUsername =
          (identityData.preferred_username as string | undefined) ??
          (identityData.username as string | undefined) ??
          (user.user_metadata?.preferred_username as string | undefined) ??
          (user.user_metadata?.user_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null
        const discordDisplayName =
          (identityData.global_name as string | undefined) ??
          (identityData.full_name as string | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          discordUsername ??
          null
        const discordAvatar =
          (identityData.avatar_url as string | undefined) ??
          (user.user_metadata?.avatar_url as string | undefined) ??
          null

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, discord_id, discord_avatar_url")
          .eq("id", user.id)
          .maybeSingle()

        if (profile && (discordId || discordUsername || discordAvatar || discordDisplayName)) {
          const updates: Record<string, string | null | undefined> = {
            discord_id: discordId,
            discord_username: discordUsername,
            discord_avatar_url: discordAvatar,
          }

          const shouldApplyDiscordAvatar =
            !profile.avatar_url ||
            profile.avatar_url === profile.discord_avatar_url ||
            isDiscordHostedAvatar(profile.avatar_url)

          if (shouldApplyDiscordAvatar) {
            updates.avatar_url = discordAvatar ?? undefined
          }

          if (!profile.discord_id) {
            if (discordDisplayName) {
              updates.display_name = discordDisplayName.slice(0, 50)
            }

            const normalizedUsername = normalizeDiscordUsername(discordUsername)
            if (normalizedUsername) {
              updates.username = await getAvailableUsername(supabase, normalizedUsername, profile.id)
            }
          }

          await supabase.from("profiles").update(updates).eq("id", user.id)
        }
      }

      router.replace(nextPath)
    }

    void run()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-destructive">
        認証に失敗しました: {error}
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">
      認証中...
    </div>
  )
}
