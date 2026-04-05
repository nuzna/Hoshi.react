"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Shield } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type AdminNavButtonProps = {
  userId: string
}

export function AdminNavButton({ userId }: AdminNavButtonProps) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let isMounted = true

    const fetchAdminState = async () => {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.rpc("is_current_user_admin")
      if (!isMounted) return
      setIsAdmin(Boolean(data))
    }

    void fetchAdminState()

    return () => {
      isMounted = false
    }
  }, [userId])

  if (!isAdmin) return null

  return (
    <Button asChild variant="ghost" size="sm" className="gap-2">
      <Link href="/admin">
        <Shield className="size-4" />
        <span className="hidden sm:inline">管理</span>
      </Link>
    </Button>
  )
}
