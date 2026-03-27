"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { AuthForm } from "@/components/auth-form"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/")
    })
  }, [router])

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto max-w-md rounded-3xl border border-border/80 bg-background/95 p-4 sm:p-6">
        <div className="mb-5 border-b border-border/80 pb-4">
          <p className="text-xs tracking-[0.22em] text-muted-foreground">HOSHI</p>
        </div>
        <AuthForm initialMode="login" />
      </div>
    </main>
  )
}
