import type { PropsWithChildren } from "react"

import { cn } from "@/lib/utils"

type PixelIconProps = {
  className?: string
}

function BaseIcon({ className, children }: PropsWithChildren<PixelIconProps>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={cn("size-5 shrink-0", className)}>
      {children}
    </svg>
  )
}

export function PixelCodeSolid({ className }: PixelIconProps) {
  return (
    <BaseIcon className={className}>
      <polygon points="15 4 16 4 16 6 15 6 15 9 14 9 14 12 13 12 13 14 12 14 12 17 11 17 11 20 10 20 10 21 9 21 9 20 8 20 8 18 9 18 9 15 10 15 10 12 11 12 11 10 12 10 12 7 13 7 13 4 14 4 14 3 15 3 15 4" />
      <polygon points="23 11 23 13 22 13 22 14 21 14 21 15 20 15 20 16 19 16 19 17 17 17 17 15 18 15 18 14 19 14 19 13 20 13 20 11 19 11 19 10 18 10 18 9 17 9 17 7 19 7 19 8 20 8 20 9 21 9 21 10 22 10 22 11 23 11" />
      <polygon points="7 7 7 9 6 9 6 10 5 10 5 11 4 11 4 13 5 13 5 14 6 14 6 15 7 15 7 17 5 17 5 16 4 16 4 15 3 15 3 14 2 14 2 13 1 13 1 11 2 11 2 10 3 10 3 9 4 9 4 8 5 8 5 7 7 7" />
    </BaseIcon>
  )
}

export function PixelBoltSolid({ className }: PixelIconProps) {
  return (
    <BaseIcon className={className}>
      <polygon points="21 10 21 11 20 11 20 12 19 12 19 13 18 13 18 14 17 14 17 15 16 15 16 16 15 16 15 17 14 17 14 18 13 18 13 19 12 19 12 20 11 20 11 21 10 21 10 22 9 22 9 23 8 23 8 21 9 21 9 18 10 18 10 14 3 14 3 13 4 13 4 12 5 12 5 11 6 11 6 10 7 10 7 9 8 9 8 8 9 8 9 7 10 7 10 6 11 6 11 5 12 5 12 4 13 4 13 3 14 3 14 2 15 2 15 1 16 1 16 3 15 3 15 6 14 6 14 10 21 10" />
    </BaseIcon>
  )
}

export function PixelUsersSolid({ className }: PixelIconProps) {
  return (
    <BaseIcon className={className}>
      <polygon points="2 13 2 12 1 12 1 10 2 10 2 9 7 9 7 12 8 12 8 13 2 13" />
      <polygon points="5 7 4 7 4 5 5 5 5 4 7 4 7 5 8 5 8 6 7 6 7 8 5 8 5 7" />
      <polygon points="8 7 9 7 9 6 10 6 10 5 14 5 14 6 15 6 15 7 16 7 16 11 15 11 15 12 14 12 14 13 10 13 10 12 9 12 9 11 8 11 8 7" />
      <polygon points="19 18 20 18 20 21 19 21 19 22 5 22 5 21 4 21 4 18 5 18 5 17 6 17 6 16 8 16 8 15 16 15 16 16 18 16 18 17 19 17 19 18" />
      <polygon points="23 10 23 12 22 12 22 13 16 13 16 12 17 12 17 9 22 9 22 10 23 10" />
      <polygon points="17 6 16 6 16 5 17 5 17 4 19 4 19 5 20 5 20 7 19 7 19 8 17 8 17 6" />
    </BaseIcon>
  )
}

export function PixelMessageDotsSolid({ className }: PixelIconProps) {
  return (
    <BaseIcon className={className}>
      <path d="m22,2v-1H2v1h-1v16h1v1h6v4h1v-1h1v-1h1v-1h2v-1h9v-1h1V2h-1Zm-13,9h-1v1h-2v-1h-1v-2h1v-1h2v1h1v2Zm5,0h-1v1h-2v-1h-1v-2h1v-1h2v1h1v2Zm5,0h-1v1h-2v-1h-1v-2h1v-1h2v1h1v2Z" />
    </BaseIcon>
  )
}

export function PixelUsersCrownSolid({ className }: PixelIconProps) {
  return (
    <BaseIcon className={className}>
      <polygon points="16 20 15 20 15 21 2 21 2 20 1 20 1 17 2 17 2 16 3 16 3 15 4 15 4 14 13 14 13 15 14 15 14 16 15 16 15 17 16 17 16 20" />
      <polygon points="13 12 13 11 14 11 14 5 18 5 18 6 19 6 19 11 18 11 18 12 13 12" />
      <polygon points="23 17 23 20 22 20 22 21 16 21 16 20 17 20 17 16 16 16 16 15 15 15 15 14 20 14 20 15 21 15 21 16 22 16 22 17 23 17" />
      <path d="m12,3v1h-1v1h-1v-1h-1v-1h-1v1h-1v1h-1v-1h-1v-1h-1v7h1v1h1v1h5v-1h1v-1h1V3h-1Zm-1,6h-1v1h-3v-1h-1v-2h5v2Z" />
    </BaseIcon>
  )
}
