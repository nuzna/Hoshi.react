import type { NextConfig } from "next"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "cdn.discordapp.com",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "i.scdn.co",
    pathname: "/**",
  },
]

if (supabaseHostname) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHostname,
    pathname: "/storage/v1/object/public/**",
  })
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns,
  },
}

export default nextConfig
