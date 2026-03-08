"use client"

import type { ReactNode } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type FollowDialogProps = {
  children: ReactNode
  title: string
  description?: string
  list: ReactNode
}

export function FollowDialog({ children, title, description, list }: FollowDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[560px] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {list}
      </DialogContent>
    </Dialog>
  )
}
