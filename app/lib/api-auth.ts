import { getSupabaseServerClient } from "@/lib/supabase/client"

export async function resolveAuthorizedUser(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }

  const accessToken = authHeader.slice("Bearer ".length)
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser(accessToken)

  if (error || !data.user) {
    return null
  }

  return {
    accessToken,
    user: data.user,
  }
}
