import Link from "next/link"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type AuthMode = "login" | "signup"

type AuthFormProps = {
  initialMode?: AuthMode
  onSuccess?: () => void
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

export function AuthForm({ initialMode = "login", onSuccess }: AuthFormProps) {
  const router = useRouter()

  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const resetFeedback = () => {
    setError(null)
    setMessage(null)
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    resetFeedback()
  }

  const handleDiscordLogin = async () => {
    const supabase = getSupabaseBrowserClient()
    resetFeedback()
    setIsLoading(true)

    try {
      const nextPath = `${window.location.pathname}${window.location.search}`
      const redirectUrl = new URL("/auth/callback", window.location.origin)
      redirectUrl.searchParams.set("next", nextPath)

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: redirectUrl.toString(),
          scopes: "identify email",
        },
      })

      if (oauthError) {
        setError(oauthError.message)
        setIsLoading(false)
        return
      }

      if (data.url) {
        window.location.href = data.url
        return
      }

      setError("Discord 認証の開始に失敗しました。")
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Discord 認証の開始に失敗しました。"
      )
      setIsLoading(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetFeedback()

    const supabase = getSupabaseBrowserClient()

    if (mode === "login") {
      setIsLoading(true)
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          setError(signInError.message)
          return
        }

        onSuccess?.()
        router.push("/")
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "ログインに失敗しました。時間をおいて再試行してください。"
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (!USERNAME_PATTERN.test(username)) {
      setError("ユーザー名は3〜20文字の英数字とアンダースコアのみ使えます。")
      return
    }

    const ageValue = Number(age)
    if (!Number.isFinite(ageValue) || ageValue < 1 || ageValue > 120) {
      setError("年齢は1〜120の範囲で入力してください。")
      return
    }

    if (!termsAccepted) {
      setError("利用規約への同意が必要です。")
      return
    }

    setIsLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.toLowerCase(),
            display_name: displayName.trim() || username,
            age: ageValue,
            gender: gender || null,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (data.session) {
        onSuccess?.()
        router.push("/")
        return
      }

      setMessage("確認メールを送信しました。メール内のリンクから認証してください。")
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "登録に失敗しました。時間をおいて再試行してください。"
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <div className="mb-4 grid grid-cols-2 rounded-full border border-border/80 bg-muted/40 p-1">
        <Button
          type="button"
          variant={mode === "login" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-full"
          onClick={() => switchMode("login")}
        >
          ログイン
        </Button>
        <Button
          type="button"
          variant={mode === "signup" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-full"
          onClick={() => switchMode("signup")}
        >
          新規登録
        </Button>
      </div>

      <div className="mb-4 space-y-1.5">
        <h2 className="text-lg font-semibold sm:text-xl">
          {mode === "login" ? "ログイン" : "アカウント作成"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {mode === "login"
            ? "メールアドレスまたは Discord でログインできます。"
            : "必要な情報を入力してアカウントを作成してください。"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" ? (
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="display-name">表示名</FieldLabel>
              <FieldContent>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="表示名"
                  maxLength={50}
                  required
                  className="h-11 rounded-2xl border-border/80 bg-background"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="username">ユーザー名</FieldLabel>
              <FieldContent>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="username"
                  minLength={3}
                  maxLength={20}
                  required
                  className="h-11 rounded-2xl border-border/80 bg-background"
                />
              </FieldContent>
            </Field>
          </FieldGroup>
        ) : null}

        <Field>
          <FieldLabel htmlFor="email">メールアドレス</FieldLabel>
          <FieldContent>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              required
              className="h-11 rounded-2xl border-border/80 bg-background"
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="password">パスワード</FieldLabel>
          <FieldContent>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8文字以上のパスワード"
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              className="h-11 rounded-2xl border-border/80 bg-background"
            />
          </FieldContent>
        </Field>

        {mode === "signup" ? (
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="age">年齢</FieldLabel>
                <FieldContent>
                  <Input
                    id="age"
                    type="number"
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                    placeholder="18"
                    min={1}
                    max={120}
                    required
                    className="h-11 rounded-2xl border-border/80 bg-background"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="gender">性別（任意）</FieldLabel>
                <FieldContent>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger
                      id="gender"
                      className="h-11 w-full rounded-2xl border-border/80 bg-background"
                    >
                      <SelectValue placeholder="選択しない" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>性別</SelectLabel>
                        <SelectItem value="male">男性</SelectItem>
                        <SelectItem value="female">女性</SelectItem>
                        <SelectItem value="other">その他</SelectItem>
                        <SelectItem value="prefer_not">回答しない</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>

            <Field
              orientation="horizontal"
              className="items-start rounded-2xl border border-border/80 px-3 py-3"
            >
              <Checkbox
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(Boolean(checked))}
                className="mt-0.5"
              />
              <FieldContent>
                <FieldLabel className="text-sm font-medium leading-6">
                  <Link
                    href="/terms"
                    className="text-foreground underline underline-offset-4"
                  >
                    利用規約
                  </Link>
                  に同意します。
                </FieldLabel>
                <FieldDescription>
                  登録前に内容を確認してください。
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        ) : null}

        {error ? <FieldError>{error}</FieldError> : null}

        {message ? (
          <p className="rounded-2xl border border-border/80 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        <div className="space-y-3 pt-1">
          <Button type="submit" className="h-11 w-full rounded-full" disabled={isLoading}>
            {isLoading
              ? mode === "login"
                ? "ログイン中..."
                : "登録中..."
              : mode === "login"
                ? "ログイン"
                : "アカウントを作成"}
          </Button>

          <Button
            type="button"
            variant="discord"
            className="h-11 w-full rounded-full"
            onClick={handleDiscordLogin}
            disabled={isLoading}
          >
            Discordで続ける
          </Button>
        </div>
      </form>
    </div>
  )
}
