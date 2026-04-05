import { Suspense } from "react"

import { ConnectionsClient } from "./connections-client"

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">
          接続情報を読み込んでいます...
        </div>
      }
    >
      <ConnectionsClient />
    </Suspense>
  )
}
