import { Suspense } from "react"

import { SpotifyCallbackClient } from "./callback-client"

export default function SpotifyCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">
          Spotify と接続しています...
        </div>
      }
    >
      <SpotifyCallbackClient />
    </Suspense>
  )
}
