const isProduction = process.env.NODE_ENV === 'production'

function getSupabaseConnectionSources() {
  const sources = new Set([
    'https://*.supabase.co',
    'wss://*.supabase.co',
  ])
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()

  if (!configuredUrl) return [...sources]

  try {
    const url = new URL(configuredUrl)
    sources.add(url.origin)

    if (url.protocol === 'https:') {
      sources.add(`wss://${url.host}`)
    } else if (url.protocol === 'http:') {
      sources.add(`ws://${url.host}`)
    }
  } catch {
    // Supabase config validation reports malformed URLs during application startup.
  }

  return [...sources]
}

const supabaseConnectionSources = getSupabaseConnectionSources()

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseConnectionSources.join(' ')}`,
      "worker-src 'self' blob:",
      ...(isProduction ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
