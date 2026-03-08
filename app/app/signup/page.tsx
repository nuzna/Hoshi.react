"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useState } from "react"

import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

export default function SignUpPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/")
    })
  }, [router])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!USERNAME_PATTERN.test(username)) {
      setError("Username must be 3-20 chars and use only letters, numbers, _.")
      return
    }

    setIsLoading(true)
    setError(null)
    setMessage(null)

    const supabase = getSupabaseBrowserClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          display_name: displayName.trim() || username,
        },
      },
    })

    setIsLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    if (data.session) {
      router.push("/")
      return
    }

    setMessage("確認メールを送信しました。メール内リンクから認証後にログインしてください。")
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background p-4 text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_16%,rgba(31,41,55,0.16),transparent_36%),radial-gradient(circle_at_90%_85%,rgba(15,23,42,0.12),transparent_42%)]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm backdrop-blur"
      >
        <div className="mb-5">
          <p className="text-xs tracking-[0.24em] text-muted-foreground">HOSHI</p>
          <h1 className="text-2xl font-semibold">Sign up</h1>
          <p className="mt-1 text-sm text-muted-foreground">プロフィール情報はあとで編集できます。</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={50}
              required
              className="h-10 w-full rounded-md border border-border/80 bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm">Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={20}
              required
              placeholder="example_user"
              className="h-10 w-full rounded-md border border-border/80 bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>

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
              autoComplete="new-password"
              className="h-10 w-full rounded-md border border-border/80 bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
              {message}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          すでにアカウントがある場合は{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Login
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
