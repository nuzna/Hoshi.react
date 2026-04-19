"use client"

import Link from "next/link"

import { Link2, LogOut, Menu, Moon, Shield, Sun, UserCircle2, Users } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { guildFeatureEnabled } from "@/lib/guild-config"

type MobileUserMenuProps = {
  profileUsername: string | null
  onSignOut: () => void
}

export function MobileUserMenu({ profileUsername, onSignOut }: MobileUserMenuProps) {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="ユーザーメニュー">
          <Menu className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>メニュー</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profileUsername ? (
          <DropdownMenuItem asChild>
            <Link href={`/user/${profileUsername}`}>
              <UserCircle2 className="size-4" />
              プロフィール
            </Link>
          </DropdownMenuItem>
        ) : null}
        {guildFeatureEnabled ? (
          <DropdownMenuItem asChild>
            <Link href="/guild">
              <Users className="size-4" />
              ギルド
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/connections">
            <Link2 className="size-4" />
            接続
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="size-4" />
          ライト
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="size-4" />
          ダーク
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Shield className="size-4" />
          システム
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="size-4" />
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
