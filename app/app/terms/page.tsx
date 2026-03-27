import { Suspense } from "react"

import { Terms } from "./terms"

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Suspense
        fallback={
          <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">
            利用規約を読み込み中...
          </div>
        }
      >
        <Terms />
      </Suspense>
    </main>
  )
}
