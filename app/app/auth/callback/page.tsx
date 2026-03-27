import { Suspense } from "react"

import { AuthCallbackClient } from "./callback-client"

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">
          認証情報を確認中...
        </div>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  )
}
