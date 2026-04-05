"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { User } from "@supabase/supabase-js"
import { ArrowLeft, Loader2, Megaphone, Search, Shield, UserSearch } from "lucide-react"

import { AnnouncementDialog } from "@/components/announcement-dialog"
import { AppMessageBanner, createErrorMessage, createSuccessMessage, type AppMessage } from "@/components/app-message"
import { MobileUserMenu } from "@/components/mobile-user-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { NotificationBell } from "@/components/notification-bell"
import { MarkdownContent } from "@/components/markdown-content"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/types"

type AdminReport = Database["public"]["Functions"]["admin_list_reports"]["Returns"][number]
type AdminSearchUser = Database["public"]["Functions"]["admin_search_users"]["Returns"][number]
type AdminLog = Database["public"]["Functions"]["admin_list_logs"]["Returns"][number]
type AdminAnnouncement = Database["public"]["Functions"]["admin_list_announcements"]["Returns"][number]

type ActionType = "freeze" | "restrict_posts" | "unfreeze" | "lift_post_restriction"

type ActionTarget = {
  userId: string
  username: string
  displayName: string
  reportId?: string | null
}

const announcementTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
})

const moderationTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const ACTION_LABELS: Record<ActionType, string> = {
  freeze: "凍結する",
  restrict_posts: "投稿を制限する",
  unfreeze: "凍結を解除する",
  lift_post_restriction: "投稿制限を解除する",
}

const DURATION_OPTIONS = [
  { label: "6時間", value: "6" },
  { label: "24時間", value: "24" },
  { label: "3日", value: "72" },
  { label: "7日", value: "168" },
  { label: "30日", value: "720" },
]

function toLocalDateTimeInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatModerationEndsAt(value: string | null) {
  if (!value) return "なし"
  return moderationTimeFormatter.format(new Date(value))
}

function formatModerationState(user: Pick<AdminSearchUser, "post_restricted_until" | "frozen_until">) {
  const now = Date.now()
  const frozenUntil = user.frozen_until ? new Date(user.frozen_until).getTime() : 0
  const restrictedUntil = user.post_restricted_until ? new Date(user.post_restricted_until).getTime() : 0

  if (frozenUntil > now) {
    return `凍結中: ${formatModerationEndsAt(user.frozen_until)} まで`
  }

  if (restrictedUntil > now) {
    return `投稿制限中: ${formatModerationEndsAt(user.post_restricted_until)} まで`
  }

  return "制限なし"
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isBootLoading, setIsBootLoading] = useState(true)

  const [reports, setReports] = useState<AdminReport[]>([])
  const [users, setUsers] = useState<AdminSearchUser[]>([])
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
  const [nowTimestamp, setNowTimestamp] = useState(0)

  const [isReportsLoading, setIsReportsLoading] = useState(false)
  const [isUsersLoading, setIsUsersLoading] = useState(false)
  const [isLogsLoading, setIsLogsLoading] = useState(false)
  const [isAnnouncementsLoading, setIsAnnouncementsLoading] = useState(false)

  const [message, setMessage] = useState<AppMessage | null>(null)
  const [userSearchQuery, setUserSearchQuery] = useState("")

  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [actionType, setActionType] = useState<ActionType>("freeze")
  const [durationHours, setDurationHours] = useState("24")
  const [actionReason, setActionReason] = useState("")
  const [isApplyingAction, setIsApplyingAction] = useState(false)
  const [dismissingReportId, setDismissingReportId] = useState<string | null>(null)

  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false)
  const [announcementTitle, setAnnouncementTitle] = useState("")
  const [announcementContent, setAnnouncementContent] = useState("")
  const [announcementPublishedAt, setAnnouncementPublishedAt] = useState("")
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false)

  const fetchReports = useCallback(async () => {
    setIsReportsLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.rpc("admin_list_reports")
    if (error) {
      setMessage(createErrorMessage(error, "通報一覧の取得に失敗しました。"))
      setReports([])
      setIsReportsLoading(false)
      return
    }
    setNowTimestamp(Date.now())
    setReports(data ?? [])
    setIsReportsLoading(false)
  }, [])

  const fetchUsers = useCallback(async (query = "") => {
    setIsUsersLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.rpc("admin_search_users", {
      search_query: query.trim() ? query.trim() : null,
    })
    if (error) {
      setMessage(createErrorMessage(error, "ユーザー検索に失敗しました。"))
      setUsers([])
      setIsUsersLoading(false)
      return
    }
    setNowTimestamp(Date.now())
    setUsers(data ?? [])
    setIsUsersLoading(false)
  }, [])

  const fetchLogs = useCallback(async () => {
    setIsLogsLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.rpc("admin_list_logs", { limit_count: 80 })
    if (error) {
      setMessage(createErrorMessage(error, "ログの取得に失敗しました。"))
      setLogs([])
      setIsLogsLoading(false)
      return
    }
    setNowTimestamp(Date.now())
    setLogs(data ?? [])
    setIsLogsLoading(false)
  }, [])

  const fetchAnnouncements = useCallback(async () => {
    setIsAnnouncementsLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.rpc("admin_list_announcements")
    if (error) {
      setMessage(createErrorMessage(error, "お知らせ一覧の取得に失敗しました。"))
      setAnnouncements([])
      setIsAnnouncementsLoading(false)
      return
    }
    setNowTimestamp(Date.now())
    setAnnouncements(data ?? [])
    setIsAnnouncementsLoading(false)
  }, [])

  const refreshAdminData = useCallback(
    async (query = userSearchQuery) => {
      await Promise.all([fetchReports(), fetchUsers(query), fetchLogs(), fetchAnnouncements()])
    },
    [fetchAnnouncements, fetchLogs, fetchReports, fetchUsers, userSearchQuery],
  )

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    const bootstrap = async () => {
      setIsBootLoading(true)
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) {
        setMessage(createErrorMessage(authError))
        setIsBootLoading(false)
        return
      }

      const currentUser = authData.user ?? null
      setUser(currentUser)

      if (!currentUser) {
        setIsBootLoading(false)
        return
      }

      const [{ data: isAdminResult, error: adminError }, { data: profileData }] = await Promise.all([
        supabase.rpc("is_current_user_admin"),
        supabase.from("profiles").select("username").eq("id", currentUser.id).maybeSingle(),
      ])

      if (adminError) {
        setMessage(createErrorMessage(adminError))
        setIsBootLoading(false)
        return
      }

      setIsAdmin(Boolean(isAdminResult))
      setProfileUsername(profileData?.username ?? null)

      if (isAdminResult) {
        await refreshAdminData()
      }

      setIsBootLoading(false)
    }

    void bootstrap()
  }, [refreshAdminData])

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      setMessage(createErrorMessage(error))
      return
    }
    window.location.href = "/"
  }

  const openActionDialog = (target: ActionTarget, nextAction: ActionType) => {
    setActionTarget(target)
    setActionType(nextAction)
    setDurationHours(nextAction === "freeze" ? "24" : "72")
    setActionReason("")
    setActionDialogOpen(true)
  }

  const handleApplyAction = async () => {
    if (!actionTarget) return

    setIsApplyingAction(true)
    const supabase = getSupabaseBrowserClient()

    const { error } = await supabase.rpc("admin_apply_user_action", {
      p_target_user_id: actionTarget.userId,
      p_action: actionType,
      p_duration_hours: actionType === "freeze" || actionType === "restrict_posts" ? Number(durationHours) : null,
      p_reason: actionReason,
      p_report_id: actionTarget.reportId ?? null,
    })

    if (error) {
      setMessage(createErrorMessage(error, "管理アクションの適用に失敗しました。"))
      setIsApplyingAction(false)
      return
    }

    setMessage(createSuccessMessage(`${actionTarget.displayName} さんへの処置を保存しました。`))
    setActionDialogOpen(false)
    setActionTarget(null)
    setIsApplyingAction(false)
    await refreshAdminData()
  }

  const handleDismissReport = async (reportId: string) => {
    setDismissingReportId(reportId)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc("admin_dismiss_report", {
      p_report_id: reportId,
      p_note: "",
    })

    if (error) {
      setMessage(createErrorMessage(error, "通報の却下に失敗しました。"))
      setDismissingReportId(null)
      return
    }

    setMessage(createSuccessMessage("通報を却下しました。"))
    setDismissingReportId(null)
    await refreshAdminData()
  }

  const handleCreateAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementContent.trim()) {
      setMessage(createErrorMessage("タイトルと本文を入力してください。"))
      return
    }

    setIsSavingAnnouncement(true)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc("admin_create_announcement", {
      p_title: announcementTitle.trim(),
      p_content_md: announcementContent,
      p_published_at: announcementPublishedAt ? new Date(announcementPublishedAt).toISOString() : null,
    })

    if (error) {
      setMessage(createErrorMessage(error, "お知らせの作成に失敗しました。"))
      setIsSavingAnnouncement(false)
      return
    }

    setMessage(createSuccessMessage("お知らせを公開しました。"))
    setAnnouncementDialogOpen(false)
    setAnnouncementTitle("")
    setAnnouncementContent("")
    setAnnouncementPublishedAt(toLocalDateTimeInputValue())
    setIsSavingAnnouncement(false)
    await fetchAnnouncements()
  }

  const handleOpenAnnouncementDialog = () => {
    setAnnouncementTitle("")
    setAnnouncementContent("")
    setAnnouncementPublishedAt(toLocalDateTimeInputValue())
    setAnnouncementDialogOpen(true)
  }

  const activeOpenReports = useMemo(() => reports.filter((report) => report.status === "open"), [reports])

  if (isBootLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[760px] px-5 py-8 sm:px-6">
          <Skeleton className="h-8 w-48" />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center px-5 text-center sm:px-6">
          <Shield className="size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">管理パネル</h1>
          <p className="mt-3 text-sm text-muted-foreground">管理パネルを開くには、管理者アカウントでログインしてください。</p>
          <div className="mt-6 flex items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/">タイムラインへ戻る</Link>
            </Button>
            <Button asChild>
              <Link href="/login">ログイン</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center px-5 text-center sm:px-6">
          <Shield className="size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">アクセス権限がありません</h1>
          <p className="mt-3 text-sm text-muted-foreground">このページは管理者フラグを持つアカウントのみ利用できます。</p>
          <div className="mt-6 flex items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/">タイムラインへ戻る</Link>
            </Button>
            <Button variant="ghost" onClick={handleSignOut}>
              ログアウト
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft className="size-4" />
                タイムライン
              </Link>
            </Button>
            <div>
              <p className="text-[11px] tracking-[0.24em] text-muted-foreground">HOSHI ADMIN</p>
              <h1 className="text-lg font-semibold">管理パネル</h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <AnnouncementDialog />
            <div className="hidden sm:block">{user ? <NotificationBell userId={user.id} /> : null}</div>
            <div className="sm:hidden">
              <MobileUserMenu profileUsername={profileUsername} onSignOut={handleSignOut} />
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              <ModeToggle />
              {profileUsername ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/user/${profileUsername}`}>プロフィール</Link>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                ログアウト
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 py-5 pb-24 sm:px-6">
        <div className="border-b border-border/80 pb-4">
          <p className="text-sm text-muted-foreground">
            通報処理、ユーザー凍結、投稿制限、お知らせ配信をここから管理できます。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>未対応の通報: {activeOpenReports.length}件</span>
            <span>ログ: {logs.length}件</span>
            <span>公開済みお知らせ: {announcements.length}件</span>
          </div>
        </div>

        <AppMessageBanner message={message} />

        <Tabs defaultValue="reports" className="mt-5">
          <TabsList variant="line" className="border-b border-border/80">
            <TabsTrigger value="reports">通報</TabsTrigger>
            <TabsTrigger value="users">ユーザー</TabsTrigger>
            <TabsTrigger value="logs">ログ</TabsTrigger>
            <TabsTrigger value="announcements">お知らせ</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="pt-5">
            {isReportsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : reports.length === 0 ? (
              <div className="py-10 text-sm text-muted-foreground">通報はまだありません。</div>
            ) : (
              <div className="divide-y divide-border/80">
                {reports.map((report) => (
                  <div key={report.report_id} className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{report.reported_display_name ?? report.reported_username ?? "不明なユーザー"}</span>
                          <span className="text-muted-foreground">@{report.reported_username ?? "unknown"}</span>
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {report.status === "open" ? "未対応" : report.status === "actioned" ? "対応済み" : "却下"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          通報者: {report.reporter_display_name ?? report.reporter_username ?? "不明"} @{report.reporter_username ?? "unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {announcementTimeFormatter.format(new Date(report.reported_at))} / カテゴリ: {report.reason_category}
                        </p>
                        {report.post_content ? <p className="text-sm">{report.post_content}</p> : null}
                        {report.reason ? <p className="text-sm text-muted-foreground">通報理由: {report.reason}</p> : null}
                        {report.resolution_note ? <p className="text-xs text-muted-foreground">対応メモ: {report.resolution_note}</p> : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openActionDialog(
                              {
                                userId: report.reported_user_id,
                                username: report.reported_username ?? "unknown",
                                displayName: report.reported_display_name ?? report.reported_username ?? "不明なユーザー",
                                reportId: report.report_id,
                              },
                              "freeze",
                            )
                          }
                        >
                          処置を選ぶ
                        </Button>
                        {report.status === "open" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={dismissingReportId === report.report_id}
                            onClick={() => void handleDismissReport(report.report_id)}
                          >
                            {dismissingReportId === report.report_id ? <Loader2 className="size-4 animate-spin" /> : null}
                            却下
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="users" className="pt-5">
            <div className="flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={userSearchQuery}
                  onChange={(event) => setUserSearchQuery(event.target.value)}
                  placeholder="ユーザー名または表示名で検索"
                  className="pl-9"
                />
              </div>
              <Button onClick={() => void fetchUsers(userSearchQuery)}>
                <UserSearch className="size-4" />
                検索
              </Button>
            </div>
            {isUsersLoading ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : users.length === 0 ? (
              <div className="py-10 text-sm text-muted-foreground">該当するユーザーはいません。</div>
            ) : (
              <div className="divide-y divide-border/80">
                {users.map((target) => (
                  <div key={target.user_id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{target.display_name}</span>
                        <span className="text-muted-foreground">@{target.username}</span>
                        {target.is_admin ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            管理者
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{target.bio || "自己紹介は未設定です。"}</p>
                      <p className="text-xs text-muted-foreground">{formatModerationState(target)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={target.is_admin}
                        onClick={() =>
                          openActionDialog(
                            {
                              userId: target.user_id,
                              username: target.username,
                              displayName: target.display_name,
                            },
                            target.frozen_until && new Date(target.frozen_until).getTime() > nowTimestamp ? "unfreeze" : "freeze",
                          )
                        }
                      >
                        {target.frozen_until && new Date(target.frozen_until).getTime() > nowTimestamp ? "凍結解除" : "凍結"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={target.is_admin}
                        onClick={() =>
                          openActionDialog(
                            {
                              userId: target.user_id,
                              username: target.username,
                              displayName: target.display_name,
                            },
                            target.post_restricted_until && new Date(target.post_restricted_until).getTime() > nowTimestamp
                              ? "lift_post_restriction"
                              : "restrict_posts",
                          )
                        }
                      >
                        {target.post_restricted_until && new Date(target.post_restricted_until).getTime() > nowTimestamp
                          ? "投稿制限解除"
                          : "投稿制限"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="pt-5">
            {isLogsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-10 text-sm text-muted-foreground">まだログはありません。</div>
            ) : (
              <div className="divide-y divide-border/80">
                {logs.map((log) => (
                  <div key={log.id} className="py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-muted-foreground">{announcementTimeFormatter.format(new Date(log.created_at))}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        管理者: {log.moderator_display_name ?? log.moderator_username ?? "不明"} / 対象: {log.target_display_name ?? log.target_username ?? "対象なし"}
                      </p>
                      {log.reason ? <p className="text-sm">{log.reason}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="announcements" className="pt-5">
            <div className="mb-4 flex items-center justify-between border-b border-border/80 pb-4">
              <div>
                <p className="text-sm font-medium">運営からのお知らせ</p>
                <p className="text-xs text-muted-foreground">Markdown を使った更新情報をそのまま掲載できます。</p>
              </div>
              <Button onClick={handleOpenAnnouncementDialog}>
                <Megaphone className="size-4" />
                新規作成
              </Button>
            </div>

            {isAnnouncementsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : announcements.length === 0 ? (
              <div className="py-10 text-sm text-muted-foreground">まだお知らせはありません。</div>
            ) : (
              <div className="divide-y divide-border/80">
                {announcements.map((announcement) => (
                  <div key={announcement.id} className="py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{announcement.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {announcementTimeFormatter.format(new Date(announcement.published_at))}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        作成者: {announcement.created_by_display_name ?? announcement.created_by_username ?? "不明"}
                      </p>
                      <MarkdownContent markdown={announcement.content_md} className="pt-2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="flex max-h-[min(88dvh,40rem)] max-w-lg flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>管理アクションを適用</DialogTitle>
            <DialogDescription>
              {actionTarget
                ? `${actionTarget.displayName} (@${actionTarget.username}) への処置を選択します。`
                : "対象ユーザーを選択してください。"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <p className="text-sm font-medium">処置</p>
              <Select value={actionType} onValueChange={(value) => setActionType(value as ActionType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="freeze">一定期間の凍結</SelectItem>
                  <SelectItem value="restrict_posts">投稿制限</SelectItem>
                  <SelectItem value="unfreeze">凍結解除</SelectItem>
                  <SelectItem value="lift_post_restriction">投稿制限解除</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {actionType === "freeze" || actionType === "restrict_posts" ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">期間</p>
                <Select value={durationHours} onValueChange={setDurationHours}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium">メモ</p>
              <Textarea
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="内部メモや対応理由を残せます。"
                className="min-h-28"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={() => void handleApplyAction()} disabled={isApplyingAction}>
              {isApplyingAction ? <Loader2 className="size-4 animate-spin" /> : null}
              {ACTION_LABELS[actionType]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={announcementDialogOpen}
        onOpenChange={(open) => {
          setAnnouncementDialogOpen(open)
          if (!open) return
          if (!announcementPublishedAt) {
            setAnnouncementPublishedAt(toLocalDateTimeInputValue())
          }
        }}
      >
        <DialogContent className="flex max-h-[min(88dvh,44rem)] max-w-2xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>お知らせを作成</DialogTitle>
            <DialogDescription>公開日時、タイトル、本文を設定してお知らせを配信します。</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <p className="text-sm font-medium">タイトル</p>
              <Input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">公開日時</p>
              <Input
                type="datetime-local"
                value={announcementPublishedAt}
                onChange={(event) => setAnnouncementPublishedAt(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">本文 (Markdown)</p>
              <Textarea
                value={announcementContent}
                onChange={(event) => setAnnouncementContent(event.target.value)}
                placeholder="# お知らせタイトル&#10;- 箇条書き&#10;[リンク](https://example.com)"
                className="min-h-56"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setAnnouncementDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={() => void handleCreateAnnouncement()} disabled={isSavingAnnouncement}>
              {isSavingAnnouncement ? <Loader2 className="size-4 animate-spin" /> : null}
              公開する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
