"use client"

import { Crown } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getDisplayFontClass, normalizeDisplayFontValue } from "@/lib/display-fonts"
import { cn } from "@/lib/utils"

type ProfileDisplayNameProps = {
  name: string
  font?: string | null
  isAdmin?: boolean
  className?: string
  textClassName?: string
  badgeClassName?: string
}

export function ProfileDisplayName({
  name,
  font,
  isAdmin = false,
  className,
  textClassName,
  badgeClassName,
}: ProfileDisplayNameProps) {
  const normalizedFont = normalizeDisplayFontValue(font)
  const isDecorativeFont = normalizedFont === "dotgothic16" || normalizedFont === "cherry_bomb"

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          getDisplayFontClass(normalizedFont),
          isDecorativeFont && "text-[1.08em] leading-none sm:text-[1.12em]",
          textClassName,
        )}
      >
        {name}
      </span>
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
