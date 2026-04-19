"use client"

import { Crown } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getDisplayFontClass, normalizeDisplayFontValue } from "@/lib/display-fonts"
import { guildFeatureEnabled } from "@/lib/guild-config"
import { cn } from "@/lib/utils"

type ProfileDisplayNameProps = {
  name: string
  font?: string | null
  isAdmin?: boolean
  guildTag?: string | null
  guildSymbol?: string | null
  className?: string
  textClassName?: string
  badgeClassName?: string
}

export function ProfileDisplayName({
  name,
  font,
  isAdmin = false,
  guildTag,
  guildSymbol,
  className,
  textClassName,
  badgeClassName,
}: ProfileDisplayNameProps) {
  const normalizedFont = normalizeDisplayFontValue(font)
  const isDecorativeFont = normalizedFont === "dotgothic16" || normalizedFont === "cherry_bomb"
  const hasGuildBadge = guildFeatureEnabled && Boolean(guildTag)

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          getDisplayFontClass(normalizedFont),
          isDecorativeFont && "text-[1.08em] leading-none sm:text-[1.12em]",
          textClassName,
        )}
      >
        {name}
      </span>
      {hasGuildBadge ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
                <span>{guildTag}</span>
                {guildSymbol ? <span aria-hidden="true">{guildSymbol}</span> : null}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <span>{guildTag}{guildSymbol ? ` ${guildSymbol}` : ""} のギルドタグ</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      {isAdmin ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-full border border-amber-500/35 bg-amber-500/12 px-1 py-0.5 text-amber-600 shadow-sm dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-300",
                  badgeClassName,
                )}
                aria-label="管理者バッジ"
              >
                <Crown className="size-3 fill-current" />
              </span>
            </TooltipTrigger>
            <TooltipContent>管理者</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </span>
  )
}
