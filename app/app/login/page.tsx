"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useState } from "react"

import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/")
    })
  }, [router])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = getSupabaseBrowserClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setIsLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    router.push("/")
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background p-4 text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_12%,rgba(31,41,55,0.16),transparent_36%),radial-gradient(circle_at_85%_90%,rgba(15,23,42,0.12),transparent_42%)]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm backdrop-blur"
      >
        <div className="mb-5">
          <p className="text-xs tracking-[0.24em] text-muted-foreground">HOSHI</p>
          <h1 className="text-2xl font-semibold">Login</h1>
          <p className="mt-1 text-sm text-muted-foreground">ログインすると投稿やリアクションが使えます。</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="h-10 w-full rounded-md border border-border/80 bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="current-password"
              className="h-10 w-full rounded-md border border-border/80 bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          アカウントがない場合は{" "}
          <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
