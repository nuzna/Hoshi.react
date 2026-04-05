"use client"

import { useEffect, useMemo, useState } from "react"

import { Loader2, Megaphone } from "lucide-react"

import { AppMessageBanner, createErrorMessage, type AppMessage } from "@/components/app-message"
import { MarkdownContent } from "@/components/markdown-content"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/types"

type Announcement = Pick<
  Database["public"]["Tables"]["announcements"]["Row"],
  "id" | "title" | "content_md" | "published_at" | "created_at"
>

const publishedAtFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function AnnouncementDialog() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState<AppMessage | null>(null)

  useEffect(() => {
    if (!open) return

    const fetchAnnouncements = async () => {
      setIsLoading(true)
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, content_md, published_at, created_at")
        .order("published_at", { ascending: false })
        .limit(20)

      if (error) {
        setMessage(createErrorMessage(error, "お知らせの取得に失敗しました。"))
        setAnnouncements([])
        setIsLoading(false)
        return
      }

      const rows = (data ?? []) as Announcement[]
      setAnnouncements(rows)
      setSelectedId((current) => current ?? rows[0]?.id ?? null)
      setMessage(null)
      setIsLoading(false)
    }

    void fetchAnnouncements()
  }, [open])

  const selectedAnnouncement = useMemo(
    () => announcements.find((announcement) => announcement.id === selectedId) ?? announcements[0] ?? null,
    [announcements, selectedId],
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="お知らせ">
          <Megaphone className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(88dvh,42rem)] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/80 px-6 py-5">
          <DialogTitle>運営からのお知らせ</DialogTitle>
          <DialogDescription>最新のお知らせやアップデートを確認できます。</DialogDescription>
        </DialogHeader>

        <AppMessageBanner message={message} />

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            お知らせを読み込み中です
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center px-6 text-sm text-muted-foreground">
            まだお知らせはありません。
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]">
            <div className="border-b border-border/80 md:border-b-0 md:border-r md:border-border/80">
              <div className="max-h-72 overflow-y-auto md:max-h-full">
                {announcements.map((announcement) => {
                  const isActive = announcement.id === selectedAnnouncement?.id
                  return (
                    <button
                      key={announcement.id}
                      type="button"
                      onClick={() => setSelectedId(announcement.id)}
                      className={`flex w-full flex-col gap-1 border-b border-border/70 px-4 py-3 text-left transition hover:bg-muted/30 ${
                        isActive ? "bg-muted/50" : ""
                      }`}
                    >
                      <span className="text-sm font-medium">{announcement.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {publishedAtFormatter.format(new Date(announcement.published_at))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedAnnouncement ? (
              <div className="min-h-0 overflow-y-auto px-6 py-5">
                <div className="mb-5 border-b border-border/70 pb-4">
                  <p className="text-xs tracking-[0.18em] text-muted-foreground">ANNOUNCEMENT</p>
                  <h3 className="mt-2 text-xl font-semibold">{selectedAnnouncement.title}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {publishedAtFormatter.format(new Date(selectedAnnouncement.published_at))}
                  </p>
                </div>
                <MarkdownContent markdown={selectedAnnouncement.content_md} />
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
