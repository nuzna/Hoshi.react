import { cn } from "@/lib/utils"

export const DISPLAY_FONT_OPTIONS = [
  { value: "geist", label: "Geist" },
  { value: "geist_mono", label: "Geist Mono" },
  { value: "dotgothic16", label: "DotGothic16" },
  { value: "cherry_bomb", label: "Cherry Bomb" },
] as const

export type DisplayFontValue = "geist" | "geist_mono" | "dotgothic16" | "cherry_bomb" | "pixelify_sans"

const DISPLAY_FONT_CLASS_MAP: Record<DisplayFontValue, string> = {
  geist: "[font-family:var(--font-geist-sans)]",
  geist_mono: "[font-family:var(--font-geist-mono)]",
  dotgothic16: "[font-family:var(--font-dotgothic16)]",
  pixelify_sans: "[font-family:var(--font-dotgothic16)]",
  cherry_bomb: "[font-family:var(--font-cherry-bomb)]",
}

export function normalizeDisplayFontValue(font: string | null | undefined): DisplayFontValue {
  if (font === "pixelify_sans") return "dotgothic16"
  if (font === "geist" || font === "geist_mono" || font === "dotgothic16" || font === "cherry_bomb") {
    return font
  }
  return "geist"
}

export function getDisplayFontClass(font: string | null | undefined) {
  return DISPLAY_FONT_CLASS_MAP[normalizeDisplayFontValue(font)]
}

export function getDisplayFontLabel(font: string | null | undefined) {
  return DISPLAY_FONT_OPTIONS.find((option) => option.value === normalizeDisplayFontValue(font))?.label ?? "Geist"
}

export function withDisplayFont(font: string | null | undefined, className?: string) {
  return cn(getDisplayFontClass(font), className)
}
