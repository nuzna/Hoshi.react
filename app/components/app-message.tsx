"use client"

import { useEffect } from "react"
import { cva } from "class-variance-authority"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

export type AppMessageKind = "error" | "success" | "info"

export type AppMessage = {
  kind: AppMessageKind
  text: string
}

const errorMap: Record<string, string> = {
  "Auth session missing!": "ログインセッションが見つかりません。もう一度ログインしてください。",
  "JWT expired": "ログインの有効期限が切れました。再度ログインしてください。",
  'row-level security policy for table "posts"': "このアカウントでは投稿を操作できません。",
  'row-level security policy for table "post_likes"': "このアカウントではいいねを操作できません。",
  'row-level security policy for table "post_reactions"': "このアカウントではリアクションを操作できません。",
  'row-level security policy for table "follows"': "このアカウントではフォローを操作できません。",
  'row-level security policy for table "profiles"': "このアカウントではプロフィールを更新できません。",
}

function translateMissingEntity(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim()

  const columnMatch = normalized.match(/column\s+("?[\w.:-]+"?)\s+does not exist/i)
  if (columnMatch?.[1]) {
    return `${columnMatch[1].replace(/"/g, "")} が見つかりません。SQL が未反映の可能性があります。`
  }

  const relationMatch = normalized.match(/relation\s+("?[\w.:-]+"?)\s+does not exist/i)
  if (relationMatch?.[1]) {
    return `${relationMatch[1].replace(/"/g, "")} が見つかりません。データベース定義を確認してください。`
  }

  const functionMatch = normalized.match(/function\s+(.+)\s+does not exist/i)
  if (functionMatch?.[1]) {
    return `${functionMatch[1].trim()} が見つかりません。SQL が未反映の可能性があります。`
  }

  return "必要な定義が見つかりません。SQL が未反映の可能性があります。"
}

export function translateError(message: string): string {
  for (const [key, value] of Object.entries(errorMap)) {
    if (message.includes(key)) return value
  }

  if (/does not exist/i.test(message)) {
    return translateMissingEntity(message)
  }

  return message
}

export function createErrorMessage(error: unknown, fallback = "エラーが発生しました。"): AppMessage {
  if (error instanceof Error && error.message) {
    return { kind: "error", text: translateError(error.message) }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.trim()
  ) {
    return { kind: "error", text: translateError((error as { message: string }).message) }
  }

  if (typeof error === "string" && error.trim()) {
    return { kind: "error", text: translateError(error) }
  }

  return { kind: "error", text: fallback }
}

export function createSuccessMessage(text: string): AppMessage {
  return { kind: "success", text }
}

export function createInfoMessage(text: string): AppMessage {
  return { kind: "info", text }
}

const messageVariants = cva("rounded-xl border px-3 py-2 text-sm", {
  variants: {
    kind: {
      error: "border-destructive/30 bg-destructive/10 text-destructive",
      success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      info: "border-border/80 bg-muted/40 text-muted-foreground",
    },
  },
  defaultVariants: {
    kind: "info",
  },
})

type AppMessageBannerProps = {
  message: AppMessage | null
  className?: string
}

export function AppMessageBanner({ message, className }: AppMessageBannerProps) {
  useEffect(() => {
    if (!message) return

    const toastOptions = {
      id: `${message.kind}:${message.text}`,
      className: cn(messageVariants({ kind: message.kind }), className),
    }

    if (message.kind === "success") {
      toast.success(message.text, toastOptions)
      return
    }

    if (message.kind === "info") {
      toast.info(message.text, toastOptions)
      return
    }

    toast.error(message.text, toastOptions)
  }, [className, message])

  return null
}
