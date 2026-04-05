import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type MarkdownBlock = {
  type: "h1" | "h2" | "li" | "p"
  text: string
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []

  for (const line of lines) {
    const text = line.trim()
    if (!text) continue

    if (text.startsWith("# ")) {
      blocks.push({ type: "h1", text: text.slice(2).trim() })
      continue
    }

    if (text.startsWith("## ")) {
      blocks.push({ type: "h2", text: text.slice(3).trim() })
      continue
    }

    if (text.startsWith("- ") || text.startsWith("・")) {
      blocks.push({ type: "li", text: text.replace(/^(- |・)/, "").trim() })
      continue
    }

    blocks.push({ type: "p", text })
  }

  return blocks
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, label, href] = match
    const start = match.index

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }

    nodes.push(
      <a
        key={`${href}-${start}`}
        href={href}
        className="text-foreground underline underline-offset-4"
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noreferrer" : undefined}
      >
        {label}
      </a>,
    )

    lastIndex = start + fullMatch.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

type MarkdownContentProps = {
  markdown: string
  className?: string
}

export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
  const blocks = parseMarkdown(markdown)

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, index) => {
        if (block.type === "h1") {
          return (
            <h2 key={index} className="pt-2 text-xl font-semibold">
              {renderInlineMarkdown(block.text)}
            </h2>
          )
        }

        if (block.type === "h2") {
          return (
            <h3 key={index} className="pt-1 text-lg font-semibold">
              {renderInlineMarkdown(block.text)}
            </h3>
          )
        }

        if (block.type === "li") {
          return (
            <p key={index} className="pl-4 text-sm leading-7 text-muted-foreground">
              ・{renderInlineMarkdown(block.text)}
            </p>
          )
        }

        return (
          <p key={index} className="text-sm leading-7 text-muted-foreground">
            {renderInlineMarkdown(block.text)}
          </p>
        )
      })}
    </div>
  )
}
