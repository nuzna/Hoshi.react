import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AuthForm } from "@/components/auth-form"

type AuthDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "login" | "signup"
}

export function AuthDialog({ open, onOpenChange, mode }: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-1rem)] max-w-[min(100%-1rem,28rem)] flex-col gap-0 overflow-hidden rounded-3xl border-border/80 bg-background p-0 shadow-2xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{mode === "login" ? "ログイン" : "アカウント作成"}</DialogTitle>
          <DialogDescription>
            Hoshi の認証ダイアログです。メールアドレスまたは Discord で認証できます。
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border/80 px-4 py-4 sm:px-5">
          <p className="text-xs tracking-[0.22em] text-muted-foreground">HOSHI</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <AuthForm key={mode} initialMode={mode} onSuccess={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
