"use client"

import Link from "next/link"

import { LogOut, Menu, Moon, Sun, UserCircle2 } from "lucide-react"
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
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="size-4" />
          ライト
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="size-4" />
          ダーク
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>システム</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="size-4" />
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

