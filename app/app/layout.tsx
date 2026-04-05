import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cherry_Bomb_One, DotGothic16, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dotGothic16 = DotGothic16({
  variable: "--font-dotgothic16",
  subsets: ["latin"],
  weight: "400",
});

const cherryBomb = Cherry_Bomb_One({
  variable: "--font-cherry-bomb",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Hoshi",
  description: "Hoshi realtime timeline",
};

export default function RootLayout({ children, }: {children: ReactNode;} ) {
  return (
    <>
    <html lang="ja" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dotGothic16.variable} ${cherryBomb.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
    </>
  );
}
