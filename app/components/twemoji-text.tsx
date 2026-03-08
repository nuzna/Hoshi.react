"use client"
/* eslint-disable @next/next/no-img-element */

import { Fragment } from "react"

import { cn } from "@/lib/utils"

const emojiLikeRegex = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null

function splitGraphemes(text: string) {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment)
  }
  return Array.from(text)
}

function toCodePointHex(emoji: string) {
  return Array.from(emoji)
    .map((character) => character.codePointAt(0) ?? 0)
    .filter((codePoint) => codePoint !== 0xfe0f)
    .map((codePoint) => codePoint.toString(16))
    .join("-")
}

function twemojiSvgUrl(emoji: string) {
  const codepoint = toCodePointHex(emoji)
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoint}.svg`
}

function isEmojiToken(token: string) {
  return emojiLikeRegex.test(token)
}

type TwemojiTextProps = {
  text: string
  className?: string
  emojiClassName?: string
}

export function TwemojiText({ text, className, emojiClassName }: TwemojiTextProps) {
  const graphemes = splitGraphemes(text)

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {graphemes.map((token, index) => {
        if (!isEmojiToken(token)) {
          return <Fragment key={`${token}-${index}`}>{token}</Fragment>
        }

        return (
          <img
            key={`${token}-${index}`}
            src={twemojiSvgUrl(token)}
            alt={token}
            draggable={false}
            className={cn("mx-0.5 inline-block size-5 align-[-0.25em]", emojiClassName)}
          />
        )
      })}
    </span>
  )
}

type TwemojiEmojiProps = {
  emoji: string
  className?: string
}

export function TwemojiEmoji({ emoji, className }: TwemojiEmojiProps) {
  return (
    <img
      src={twemojiSvgUrl(emoji)}
      alt={emoji}
      draggable={false}
      className={cn("inline-block size-4 align-[-0.2em]", className)}
    />
  )
}
