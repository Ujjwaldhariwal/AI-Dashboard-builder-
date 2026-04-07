// src/lib/code-generator/template-generator.ts
import type { DashboardExportConfig } from './config-builder'

export type GeneratedFileMap = Record<string, string>
export const EXPORTED_CHART_TYPES = [
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'horizontal-bar',
  'horizontal-stacked-bar',
  'grouped-bar',
  'drilldown-bar',
  'gauge',
  'ring-gauge',
  'status-card',
  'table',
] as const

export function generateProjectFromConfig(
  config: DashboardExportConfig,
): GeneratedFileMap {
  const files: GeneratedFileMap = {}
  const { projectConfig: pc } = config
  const clientSafeConfig = buildClientSafeExportConfig(config)
  const includeBoschProxy = shouldIncludeBoschProxy(config)
  const boschProxyDefaults = deriveBoschProxyDefaults(config)

  // â”€â”€ package.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  files['package.json'] = JSON.stringify({
    name:    slugify(config.meta.name),
    version: '0.1.0',
    private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dependencies: {
      next:                '^14.0.0',
      react:               '^18.0.0',
      'react-dom':         '^18.0.0',
      echarts:             '^5.4.3',
      'echarts-for-react': '^3.0.2',
      axios:               '^1.6.0',
      jspdf:               '^2.5.1',
      html2canvas:         '^1.4.1',
    },
    devDependencies: {
      typescript:         '^5.0.0',
      '@types/node':      '^20.0.0',
      '@types/react':     '^18.0.0',
      '@types/react-dom': '^18.0.0',
    },
  }, null, 2)

  // â”€â”€ next.config.mjs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  files['next.config.mjs'] = `/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
`

  // â”€â”€ tsconfig.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  files['tsconfig.json'] = JSON.stringify({
    compilerOptions: {
      target:            'ES2017',
      lib:               ['dom', 'dom.iterable', 'esnext'],
      allowJs:           true,
      skipLibCheck:      true,
      strict:            false,
      noEmit:            true,
      esModuleInterop:   true,
      module:            'esnext',
      moduleResolution:  'bundler',
      resolveJsonModule: true,
      isolatedModules:   true,
      jsx:               'preserve',
      incremental:       true,
      plugins:           [{ name: 'next' }],
      paths:             { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2)

  // â”€â”€ globals.css â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  files['src/app/globals.css'] = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
input, button, select { font-family: inherit; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
`

  // â”€â”€ layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  files['src/app/layout.tsx'] = `import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '${pc.projectTitle}',
  description: '${config.meta.description ?? pc.clientName + ' Dashboard'}',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

  // â”€â”€ root page â†’ redirect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  files['src/app/page.tsx'] = `'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    const user = localStorage.getItem('authUser')
    router.replace(user ? '/dashboard' : '/login')
  }, [router])
  return null
}
`

  files['src/app/login/page.tsx']          = generateLoginPage(config)
  const generatedEnvLocal = generateEnvLocal(includeBoschProxy, boschProxyDefaults)
  if (generatedEnvLocal) {
    files['.env.local'] = generatedEnvLocal
  }
  if (includeBoschProxy) {
    files['src/app/api/bosch/[...path]/route.ts'] = generateBoschProxyRoute(boschProxyDefaults)
  }
  files['src/app/dashboard/layout.tsx']    = generateDashboardLayout(config)
  files['src/app/dashboard/page.tsx']      = generateDashboardPage(config)
  files['src/lib/config.ts']               = `// Auto-generated by Analytics AI Dashboard Builder
// Exported: ${new Date(config.meta.exportedAt).toLocaleString()}
// Client: ${pc.clientName}

import type { DashboardConfig } from './types'

export const dashboardConfig: DashboardConfig = ${JSON.stringify(clientSafeConfig, null, 2)} as const
`
  files['__codex/ai-export-config.json']   = JSON.stringify(
    config.projectConfig.aiExportConfig ?? null,
    null,
    2,
  )
  files['src/lib/types.ts']                = generateTypes()
  files['src/lib/apiClient.ts']            = generateApiClient(config)
  files['src/hooks/useChartData.ts']       = generateUseChartData()
  files['src/lib/builder/data-transformer.ts'] = generateDataTransformer()
  files['src/components/Sidebar.tsx']      = generateSidebar(config)
  files['src/components/Header.tsx']       = generateHeader(config)
  files['src/components/WidgetChart.tsx']  = generateWidgetChart()
  files['src/components/PDFExport.tsx']    = generatePDFExport(config)
  files['src/components/AuthGuard.tsx']    = generateAuthGuard()
  files['README.md']                       = generateReadme(config)

  return files
}

function buildClientSafeExportConfig(config: DashboardExportConfig): DashboardExportConfig {
  const aiExportConfig = config.projectConfig.aiExportConfig
  const safeAiExportConfig = aiExportConfig
    ? {
        ...aiExportConfig,
        apiKey: '',
      }
    : undefined
  const safeDefaultHeaders = sanitizeDefaultHeadersForExport(
    config.projectConfig.defaultHeaders ?? {},
  )

  return {
    ...config,
    projectConfig: {
      ...config.projectConfig,
      defaultHeaders: safeDefaultHeaders,
      aiExportConfig: safeAiExportConfig,
    },
  }
}

interface BoschProxyDefaults {
  defaultTarget: string
  fallbackBaseUrl: string
  targetBaseUrls: Record<string, string>
}

function sanitizeDefaultHeadersForExport(
  headers: Record<string, string>,
): Record<string, string> {
  const sanitized: Record<string, string> = {}
  Object.entries(headers).forEach(([key, value]) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (isTemplatePlaceholder(trimmed)) return
    sanitized[key] = trimmed
  })
  return sanitized
}

function isTemplatePlaceholder(value: string): boolean {
  return /^\{\{.+\}\}$/.test(value.trim())
}

function normalizeEnvTarget(value: string | undefined): string {
  const normalized = (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return normalized || 'AGRA'
}

function normalizeUrl(value: string): string {
  let next = value.trim()
  while (next.endsWith('/')) next = next.slice(0, -1)
  return next
}

function extractAbsoluteBaseFromUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null

  try {
    const parsed = new URL(trimmed)
    let pathname = parsed.pathname.replace(/\/+$/, '')
    const lowered = pathname.toLowerCase()
    const loginSuffixes = ['/user/login', '/userlogin', '/login']

    for (const suffix of loginSuffixes) {
      if (lowered.endsWith(suffix)) {
        pathname = pathname.slice(0, pathname.length - suffix.length)
        return normalizeUrl(`${parsed.origin}${pathname}`)
      }
    }

    if (!pathname || pathname === '/') return parsed.origin
    const lastSlash = pathname.lastIndexOf('/')
    if (lastSlash <= 0) return parsed.origin
    pathname = pathname.slice(0, lastSlash)
    return normalizeUrl(`${parsed.origin}${pathname}`)
  } catch {
    return null
  }
}

function deriveBoschProxyDefaults(config: DashboardExportConfig): BoschProxyDefaults {
  const knownTargets: Record<string, string> = {
    AGRA: 'https://agdashboard.agamismartmeters.com/BOSCH/API',
    KASHI: 'https://kadashboard.kaamismartmeters.com/BOSCH/API',
    PRAYAGRAJ: 'https://prdashboard.pramismartmeters.com/BOSCH/API',
  }

  const defaultTarget = normalizeEnvTarget(
    config.projectConfig.defaultHeaders['x-bosch-env']
      ?? config.projectConfig.defaultHeaders['X-Bosch-Env'],
  )

  const absoluteCandidates = [
    extractAbsoluteBaseFromUrl(config.projectConfig.baseUrl),
    extractAbsoluteBaseFromUrl(config.projectConfig.login.endpoint),
    ...config.endpoints.map(endpoint => extractAbsoluteBaseFromUrl(endpoint.url)),
  ].filter((value): value is string => Boolean(value))

  const fallbackBaseUrl = absoluteCandidates[0]
    ?? knownTargets[defaultTarget]
    ?? knownTargets.AGRA

  return {
    defaultTarget,
    fallbackBaseUrl,
    targetBaseUrls: {
      ...knownTargets,
      [defaultTarget]: fallbackBaseUrl,
    },
  }
}

function generateEnvLocal(
  includeBoschProxy: boolean,
  defaults: BoschProxyDefaults,
): string | null {
  if (!includeBoschProxy) return null

  const targetLines = Object.entries(defaults.targetBaseUrls)
    .map(([target, baseUrl]) => [normalizeEnvTarget(target), normalizeUrl(baseUrl)] as const)
    .filter(([, baseUrl]) => Boolean(baseUrl))
    .map(([target, baseUrl]) => `BOSCH_BASE_URL_${target}=${baseUrl}`)
    .join('\n')

  return `# Bosch proxy runtime settings (auto-generated)
# Change these values if your deployment environment differs.
BOSCH_DEFAULT_ENV=${defaults.defaultTarget}
BOSCH_BASE_URL=${defaults.fallbackBaseUrl}
${targetLines}

# Optional service credentials for Bosch gateway (if required by your API)
BOSCH_USERID=
BOSCH_PASSWORD=
`
}


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GENERATORS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function shouldIncludeBoschProxy(config: DashboardExportConfig): boolean {
  const startsWithBoschProxy = (value: string | undefined) =>
    typeof value === 'string' && value.trim().toLowerCase().startsWith('/api/bosch')

  if (config.projectConfig.chartTheme === 'bosch-uppcl') return true
  if (startsWithBoschProxy(config.projectConfig.baseUrl)) return true
  if (startsWithBoschProxy(config.projectConfig.login.endpoint)) return true

  if (config.endpoints.some(endpoint => startsWithBoschProxy(endpoint.url))) return true

  const context = [
    config.projectConfig.clientName,
    config.projectConfig.projectTitle,
    config.projectConfig.login.endpoint,
    ...config.endpoints.map(endpoint => endpoint.url),
  ]
    .map(value => value.toLowerCase())
    .join(' ')

  return context.includes('bosch') || context.includes('uppcl')
}

function generateBoschProxyRoute(defaults: BoschProxyDefaults): string {
  const targetMap = JSON.stringify(defaults.targetBaseUrls, null, 2)
  return `import { NextRequest, NextResponse } from 'next/server'

const BOSCH_DEFAULT_ENV = '${defaults.defaultTarget}'
const BOSCH_BASE_FALLBACK = '${defaults.fallbackBaseUrl}'
const BOSCH_TARGET_BASES: Record<string, string> = ${targetMap}
const REQUEST_TIMEOUT_MS = 20000

type RouteContext = {
  params: Promise<{ path: string[] }>
}

function trimValue(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function normalizeBaseUrl(value: string): string {
  let next = trimValue(value)
  while (next.endsWith('/')) next = next.slice(0, -1)
  return next
}

function normalizeTarget(value: string | null | undefined): string {
  const normalized = trimValue(value).toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return normalized || BOSCH_DEFAULT_ENV
}

function pickFirstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]
    if (value && trimValue(value)) return trimValue(value)
  }
  return ''
}

function isTemplatePlaceholder(value: string): boolean {
  return /^\\{\\{.+\\}\\}$/.test(trimValue(value))
}

function isUsableCredential(value: string): boolean {
  return Boolean(trimValue(value)) && !isTemplatePlaceholder(value)
}

function resolveTarget(req: NextRequest): string {
  const fromHeader = req.headers.get('x-bosch-env')
  const fromQuery = req.nextUrl.searchParams.get('env')
  const fromEnv = process.env.BOSCH_DEFAULT_ENV
  return normalizeTarget(fromHeader ?? fromQuery ?? fromEnv ?? BOSCH_DEFAULT_ENV)
}

function resolveBaseUrl(req: NextRequest, target: string): string {
  const fromHeader = trimValue(req.headers.get('x-bosch-base-url'))
  if (fromHeader) return normalizeBaseUrl(fromHeader)

  const fromTargetEnv = pickFirstEnv(\`BOSCH_BASE_URL_\${target}\`, \`BOSCH_\${target}_BASE_URL\`)
  if (fromTargetEnv) return normalizeBaseUrl(fromTargetEnv)

  const fromEnv = pickFirstEnv('BOSCH_BASE_URL')
  if (fromEnv) return normalizeBaseUrl(fromEnv)

  const fromKnownTarget = BOSCH_TARGET_BASES[target]
  if (fromKnownTarget) return normalizeBaseUrl(fromKnownTarget)

  return normalizeBaseUrl(BOSCH_BASE_FALLBACK)
}

function resolveCredentials(req: NextRequest, target: string): { userid: string; password: string } | null {
  const envUser = pickFirstEnv(\`BOSCH_USERID_\${target}\`, \`BOSCH_\${target}_USERID\`, 'BOSCH_USERID')
  const envPass = pickFirstEnv(\`BOSCH_PASSWORD_\${target}\`, \`BOSCH_\${target}_PASSWORD\`, 'BOSCH_PASSWORD')
  if (isUsableCredential(envUser) && isUsableCredential(envPass)) return { userid: envUser, password: envPass }

  const headerUser = trimValue(req.headers.get('userid'))
  const headerPass = trimValue(req.headers.get('password'))
  if (isUsableCredential(headerUser) && isUsableCredential(headerPass)) {
    return { userid: headerUser, password: headerPass }
  }

  return null
}

function isLoginEndpoint(endpoint: string): boolean {
  const lower = endpoint.toLowerCase()
  return lower.endsWith('/userlogin') || lower.endsWith('/user/login') || lower.endsWith('/login')
}

function buildBasicAuth(userid: string, password: string): string {
  const token = Buffer.from(userid + ':' + password, 'utf8').toString('base64')
  return 'Basic ' + token
}

function buildForwardHeaders(
  req: NextRequest,
  endpoint: string,
  credentials: { userid: string; password: string } | null,
): Headers {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')

  const isLogin = isLoginEndpoint(endpoint)
  const incomingAuth = trimValue(req.headers.get('authorization'))
  if (incomingAuth && !isLogin) {
    headers.set('Authorization', incomingAuth)
  } else if (credentials) {
    headers.set('Authorization', buildBasicAuth(credentials.userid, credentials.password))
  } else if (incomingAuth) {
    headers.set('Authorization', incomingAuth)
  }

  if (credentials) {
    headers.set('userid', credentials.userid)
    headers.set('password', credentials.password)
  }

  const cookie = trimValue(req.headers.get('cookie'))
  if (cookie) headers.set('Cookie', cookie)

  return headers
}

function getSetCookieHeaders(headers: Headers): string[] {
  const maybeHeaders = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof maybeHeaders.getSetCookie === 'function') {
    return maybeHeaders.getSetCookie().filter(Boolean)
  }
  const fallback = headers.get('set-cookie')
  return fallback ? [fallback] : []
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function resolveErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = (error as { cause?: { code?: unknown } }).cause?.code
  if (typeof candidate === 'string' && candidate.trim()) return candidate
  return undefined
}

async function forward(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  if (!path || path.length === 0) {
    return NextResponse.json({ error: 'Missing Bosch API path' }, { status: 400 })
  }

  const endpoint = '/' + path.join('/')
  const target = resolveTarget(req)
  const baseUrl = resolveBaseUrl(req, target)
  const credentials = resolveCredentials(req, target)
  if (!baseUrl) {
    return NextResponse.json(
      {
        error: 'Bosch proxy base URL is not configured.',
        target,
        hint: 'Set BOSCH_BASE_URL or BOSCH_BASE_URL_<TARGET> in .env.local and restart.',
      },
      { status: 500 },
    )
  }

  try {
    const upstreamUrl = new URL(baseUrl + endpoint)
    req.nextUrl.searchParams.forEach((value, key) => {
      if (key.toLowerCase() === 'env') return
      upstreamUrl.searchParams.append(key, value)
    })

    const method = req.method.toUpperCase()
    const rawBody = method === 'POST' ? await req.text() : ''

    const response = await fetch(upstreamUrl.toString(), {
      method,
      headers: buildForwardHeaders(req, endpoint, credentials),
      body: method === 'POST' ? (rawBody.trim() ? rawBody : '{}') : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const text = await response.text()
    const payload = text ? safeJsonParse(text) : null
    const proxiedResponse = NextResponse.json(payload, { status: response.status })
    const setCookies = getSetCookieHeaders(response.headers)
    setCookies.forEach(cookie => proxiedResponse.headers.append('set-cookie', cookie))
    return proxiedResponse
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Bosch proxy failed'
    const code = resolveErrorCode(error)
    return NextResponse.json(
      {
        error: 'Bosch proxy request failed.',
        details,
        code,
        endpoint,
        target,
        baseUrl,
        hint: 'Verify VPN/network access and BOSCH_BASE_URL target values.',
      },
      { status: 502 },
    )
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}
`
}
function generateLoginPage(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  const isBasic = pc.authStrategy === 'basic'
  const isBtoa  = pc.login.encodingType === 'btoa'

  return `'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, resolveRequestUrl } from '@/lib/apiClient'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const body: Record<string, string> = {
        ${pc.login.usernameField}: ${isBtoa ? "btoa(username + ':' + password)" : 'username'},
        ${isBasic ? `${pc.login.passwordField}: password,` : ''}
      }
      const loginUrl = resolveRequestUrl('${pc.login.endpoint}')
      const res   = await apiClient.post(loginUrl, body)
      const data  = res.data
      const failedByBody = Boolean(
        data &&
          typeof data === 'object' &&
          'status' in (data as Record<string, unknown>) &&
          (data as { status?: unknown }).status === false
      )
      if (failedByBody) {
        const msg = typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message: string }).message
          : 'Login failed. Check credentials.'
        throw new Error(msg)
      }
      const tokenValue = '${pc.login.tokenPath}'.split('.').reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== 'object') return undefined
        return (acc as Record<string, unknown>)[key]
      }, data as Record<string, unknown>)
      const token = typeof tokenValue === 'string' ? tokenValue : ''
      localStorage.setItem('authUser', JSON.stringify({ ...data?.data, token, username }))
      router.push('/dashboard')
    } catch (err: unknown) {
      // âœ… err typed as unknown â€” safe extraction
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(message || 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoBar}>
          <div style={{ ...styles.logoCircle, background: '${pc.header.accentColor}' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>
              {('${pc.projectTitle}').charAt(0)}
            </span>
          </div>
        </div>
        <h1 style={styles.title}>${pc.projectTitle}</h1>
        <p style={styles.sub}>${pc.clientName ? pc.clientName + ' Â· ' : ''}Sign in to continue</p>
        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input style={styles.input} type="text" value={username}
              onChange={e => setUsername(e.target.value)} required autoFocus placeholder="Enter username" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" value={password}
              onChange={e => setPassword(e.target.value)} required placeholder="Enter password" />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ ...styles.btn, background: loading ? '#94a3b8' : '${pc.header.accentColor}' }}>
            {loading ? 'Signing inâ€¦' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:       { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' },
  card:       { background: '#fff', borderRadius: 16, padding: '2.5rem 2rem', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logoBar:    { display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' },
  logoCircle: { width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', color: '#0f172a', marginBottom: 4 },
  sub:        { fontSize: '0.82rem', color: '#64748b', textAlign: 'center', marginBottom: '1.75rem' },
  form:       { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field:      { display: 'flex', flexDirection: 'column', gap: 6 },
  label:      { fontSize: '0.78rem', fontWeight: 600, color: '#374151' },
  input:      { padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', outline: 'none', transition: 'border 0.2s' },
  error:      { fontSize: '0.78rem', color: '#ef4444', textAlign: 'center' },
  btn:        { padding: '0.7rem', borderRadius: 9, border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', marginTop: 4 },
}
`
}

function generateDashboardLayout(_config: DashboardExportConfig): string {
  return `'use client'
import { AuthGuard } from '@/components/AuthGuard'
import { Sidebar }   from '@/components/Sidebar'
import { Header }    from '@/components/Header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Header />
          <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', background: '#f1f5f9' }}>
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
`
}

function generateDashboardPage(config: DashboardExportConfig): string {
  return `'use client'
import { useState }       from 'react'
import { dashboardConfig } from '@/lib/config'
import { WidgetChart }    from '@/components/WidgetChart'
import { PDFExport }      from '@/components/PDFExport'

export default function DashboardPage() {
  const { groups, widgets, endpoints } = dashboardConfig
  const [activeGroup, setActiveGroup]  = useState<string | 'all'>('all')

  const visibleWidgets = activeGroup === 'all'
    ? widgets
    : widgets.filter(w => {
        const g = groups.find(g => g.id === activeGroup)
        return g?.widgetIds.includes(w.id)
      })

  return (
    <div>
      {groups.length > 0 && (
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(activeGroup === 'all' ? styles.tabActive : {}) }}
            onClick={() => setActiveGroup('all')}
          >
            All Charts
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              style={{ ...styles.tab, ...(activeGroup === g.id ? styles.tabActive : {}) }}
              onClick={() => setActiveGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <PDFExport widgets={visibleWidgets} />
      </div>
      <div id="dashboard-charts" style={styles.grid}>
        {visibleWidgets.map(widget => (
          <WidgetChart key={widget.id} widget={widget} endpoints={endpoints} />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  tabs:      { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1.25rem' },
  tab:       { padding: '0.4rem 1rem', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', color: '#475569' },
  tabActive: { background: '${config.projectConfig.header.accentColor}', color: '#fff', borderColor: '${config.projectConfig.header.accentColor}' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '1.25rem' },
}
`
}

// âœ… S6-2 â€” concrete types instead of any
function generateTypes(): string {
  return `// Auto-generated types
export type TransformMathOperator = '+' | '-' | '*' | '/'
export type TransformFilterOperator = '>' | '<' | '=' | '!=' | '>=' | '<='
export type TransformSortOrder = 'asc' | 'desc'

export type TransformOp =
  | { type: 'parse_number'; field: string }
  | { type: 'concat'; fields: string[]; separator: string; outputField: string }
  | { type: 'rename'; from: string; to: string }
  | { type: 'math'; field: string; operator: TransformMathOperator; value: number; outputField: string }
  | { type: 'percent_of_total'; field: string; outputField: string }
  | { type: 'filter_rows'; field: string; operator: TransformFilterOperator; value: unknown }
  | { type: 'sort'; field: string; order: TransformSortOrder }
  | { type: 'limit'; count: number }

export interface YAxisConfig {
  key: string
  color: string
  label?: string
}

export interface DataMapping {
  xAxis: string
  yAxis?: string
  yAxes?: YAxisConfig[]
  aliases?: Record<string, string>
  transforms?: TransformOp[]
  sortBy?: string
  sortOrder?: TransformSortOrder
  limit?: number
}

export interface ExportWidget {
  id:          string
  title:       string
  type:        string
  endpointId:  string
  dataMapping: DataMapping
  groupId?:    string
  colors:      string[]
  barRadius:   number
  showLegend:  boolean
  showGrid:    boolean
}

export interface ExportEndpoint {
  id:       string
  name:     string
  url:      string
  method:   string
  authType?: string
  headers?: Record<string, string>
  body?:    string
}

export interface ExportGroup {
  id:        string
  name:      string
  order:     number
  widgetIds: string[]
}

export interface ExportMeta {
  name:        string
  description: string
  exportedAt:  string
}

export interface ExportProjectConfig {
  projectTitle:  string
  clientName:    string
  baseUrl:       string
  chartTheme:    'enterprise' | 'bosch-uppcl'
  authStrategy:  string
  defaultHeaders: Record<string, string>
  header: {
    subtitle?:    string
    primaryColor: string
    accentColor:  string
    navDensity?:  'compact' | 'comfortable'
  }
  login: {
    endpoint:      string
    usernameField: string
    passwordField: string
    tokenPath:     string
    encodingType:  string
  }
  session: {
    logoutOn401:      boolean
    logoutOnMessage:  string
  }
}

export interface DashboardConfig {
  meta:          ExportMeta
  projectConfig: ExportProjectConfig
  endpoints:     ExportEndpoint[]
  widgets:       ExportWidget[]
  groups:        ExportGroup[]
}
`
}

function generateApiClient(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  const encodedDefaultHeaders = JSON.stringify(pc.defaultHeaders ?? {}, null, 2)
  return `import axios, { type InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = '${pc.baseUrl}'

export function resolveRequestUrl(url: string): string {
  const trimmed = (url ?? '').trim()
  const lower = trimmed.toLowerCase()
  let base = API_BASE_URL
  while (base.endsWith('/')) {
    base = base.slice(0, -1)
  }

  if (!trimmed) return base || '/'
  if (lower.startsWith('http://') || lower.startsWith('https://')) return trimmed

  const relative = trimmed.startsWith('/') ? trimmed : \`/\${trimmed}\`
  if (base && !base.toLowerCase().startsWith('http://') && !base.toLowerCase().startsWith('https://')) {
    const baseWithSlash = \`\${base}/\`
    if (relative === base || relative.startsWith(baseWithSlash)) {
      return relative
    }
  }

  if (base && (base.toLowerCase().startsWith('http://') || base.toLowerCase().startsWith('https://'))) {
    try {
      const parsedBase = new URL(base)
      let basePath = parsedBase.pathname
      while (basePath.endsWith('/')) {
        basePath = basePath.slice(0, -1)
      }
      if (basePath && (relative === basePath || relative.startsWith(\`\${basePath}/\`))) {
        return \`\${parsedBase.origin}\${relative}\`
      }
    } catch {
      // noop - fallback to default composition below
    }
  }

  return base ? \`\${base}\${relative}\` : relative
}

export const apiClient = axios.create({
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    ...${encodedDefaultHeaders},
  },
})

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.url = resolveRequestUrl(config.url ?? '')

  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    if (user?.token) {
      config.headers = config.headers ?? {}
      ;(config.headers as Record<string, string>).Authorization = \`Bearer \${user.token}\`
    }
  } catch {}

  return config
})

apiClient.interceptors.response.use(
  res => res,
  err => {
    const status = err?.response?.status
    const message = err?.response?.data?.message ?? ''
    if (status === ${pc.session.logoutOn401 ? 401 : 999} || message.includes('${pc.session.logoutOnMessage}')) {
      localStorage.removeItem('authUser')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
`
}

function generateUseChartData(): string {
  return `'use client'
import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { applyTransforms } from '@/lib/builder/data-transformer'
import type { DataMapping, ExportEndpoint } from '@/lib/types'

function parseEndpointBody(body?: string): unknown {
  if (body === undefined) return undefined
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

function normalizeRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const candidate = obj.data ?? obj.results ?? obj.items ?? obj.list
    if (Array.isArray(candidate)) return candidate as Record<string, unknown>[]
    return [obj]
  }
  return []
}

function parseComparable(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const asNumber = Number(value)
  if (!Number.isNaN(asNumber) && value !== null && value !== undefined && String(value).trim() !== '') {
    return asNumber
  }
  return String(value ?? '')
}

function applySortAndLimit(rows: Record<string, unknown>[], dataMapping: DataMapping): Record<string, unknown>[] {
  let nextRows = rows

  if (dataMapping.sortBy) {
    const direction = dataMapping.sortOrder === 'asc' ? 1 : -1
    nextRows = [...nextRows].sort((a, b) => {
      const left = parseComparable(a[dataMapping.sortBy as string])
      const right = parseComparable(b[dataMapping.sortBy as string])

      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction
      }
      return String(left).localeCompare(String(right)) * direction
    })
  }

  if (typeof dataMapping.limit === 'number' && dataMapping.limit > 0) {
    nextRows = nextRows.slice(0, Math.trunc(dataMapping.limit))
  }

  return nextRows
}

export function useChartData(endpoint: ExportEndpoint | undefined, dataMapping: DataMapping) {
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const endpointHeadersKey = useMemo(() => JSON.stringify(endpoint?.headers ?? {}), [endpoint?.headers])
  const transformsKey = useMemo(() => JSON.stringify(dataMapping.transforms ?? []), [dataMapping.transforms])

  useEffect(() => {
    if (!endpoint) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const requestConfig = endpoint.headers && Object.keys(endpoint.headers).length > 0
      ? { headers: endpoint.headers }
      : undefined

    const request = endpoint.method === 'POST'
      ? apiClient.post(endpoint.url, parseEndpointBody(endpoint.body), requestConfig)
      : apiClient.get(endpoint.url, requestConfig)

    request
      .then((res) => {
        const rawRows = normalizeRows(res.data)
        const transformed = applyTransforms(rawRows, dataMapping.transforms ?? [])
        const finalized = applySortAndLimit(transformed, dataMapping)
        setData(finalized)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [
    endpoint?.id,
    endpoint?.url,
    endpoint?.method,
    endpoint?.body,
    endpointHeadersKey,
    transformsKey,
    dataMapping.sortBy,
    dataMapping.sortOrder,
    dataMapping.limit,
  ])

  return { data, loading, error }
}
`
}
function generateSidebar(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  const isCompact = pc.header.navDensity === 'compact'
  const navPaddingExpr = isCompact
    ? "collapsed ? '0.45rem' : '0.35rem 0.85rem'"
    : "collapsed ? '0.6rem' : '0.5rem 1rem'"
  const navFontSize = isCompact ? '0.75rem' : '0.8rem'
  const sectionPadding = isCompact ? '0.35rem 1rem' : '0.5rem 1rem'
  const logoutPaddingExpr = isCompact
    ? "collapsed ? '0.45rem' : '0.45rem 0.9rem'"
    : "collapsed ? '0.5rem' : '0.5rem 1rem'"
  const sidebarSubtitle = pc.header.subtitle ?? ''
  const safeSidebarSubtitle = sidebarSubtitle
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')

  return `'use client'
import { useState }       from 'react'
import { useRouter }      from 'next/navigation'
import { dashboardConfig } from '@/lib/config'

export function Sidebar() {
  const router = useRouter()
  const { groups, projectConfig: pc } = dashboardConfig
  const [collapsed, setCollapsed]     = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('authUser')
    router.push('/login')
  }

  return (
    <aside style={{
      width:         collapsed ? 60 : 240,
      minHeight:     '100vh',
      background:    '${pc.header.primaryColor}',
      display:       'flex',
      flexDirection: 'column',
      transition:    'width 0.25s ease',
      flexShrink:    0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: '${pc.header.accentColor}', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>{('${pc.projectTitle}').charAt(0)}</span>
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
              ${pc.projectTitle}
            </span>
            ${sidebarSubtitle
              ? `<span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.65rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ${safeSidebarSubtitle}
            </span>`
              : ''
            }
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16 }}
        >
          {collapsed ? 'â†’' : 'â†'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.75rem 0', overflowY: 'auto' }}>
        {groups.length > 0 ? groups.map(group => (
          <div key={group.id}>
            {!collapsed && (
              <p style={{ padding: '${sectionPadding}', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                {group.name}
              </p>
            )}
            {group.widgetIds.slice(0, 3).map(wid => {
              const w = dashboardConfig.widgets.find(w => w.id === wid)
              if (!w) return null
              return (
                <a key={wid} href={\`#widget-\${w.id}\`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: ${navPaddingExpr}, color: 'rgba(255,255,255,0.75)', fontSize: '${navFontSize}', textDecoration: 'none', borderRadius: 8, margin: '1px 8px', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 12 }}>ðŸ“Š</span>
                  {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</span>}
                </a>
              )
            })}
          </div>
        )) : (
          dashboardConfig.widgets.map(w => (
            <a key={w.id} href={\`#widget-\${w.id}\`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: ${navPaddingExpr}, color: 'rgba(255,255,255,0.75)', fontSize: '${navFontSize}', textDecoration: 'none', borderRadius: 8, margin: '1px 8px' }}
            >
              <span style={{ fontSize: 12 }}>ðŸ“Š</span>
              {!collapsed && w.title}
            </a>
          ))
        )}
      </nav>

      {/* Logout */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={handleLogout}
          style={{ width: '100%', padding: ${logoutPaddingExpr}, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '${navFontSize}', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8 }}>
          ðŸšª {!collapsed && 'Logout'}
        </button>
      </div>
    </aside>
  )
}
`
}

function generateHeader(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  const headerSubtitle = pc.header.subtitle ?? ''
  const safeHeaderSubtitle = headerSubtitle
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')

  return `'use client'
import { dashboardConfig } from '@/lib/config'

export function Header() {
  const { projectConfig: pc } = dashboardConfig
  let username = ''
  try { username = JSON.parse(localStorage.getItem('authUser') || '{}')?.username || '' } catch {}

  return (
    <header style={{ height: 56, background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', flexShrink: 0 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ${pc.projectTitle}
        </h1>
        ${headerSubtitle
          ? `<p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ${safeHeaderSubtitle}
        </p>`
          : ''
        }
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {username && (
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Welcome, {username}</span>
        )}
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '${pc.header.accentColor}', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>
          {username ? username.charAt(0).toUpperCase() : '?'}
        </div>
      </div>
    </header>
  )
}
`
}

function generateWidgetChart(): string {
  return `'use client'
import { useRef }             from 'react'
import ReactECharts            from 'echarts-for-react'
import { useChartData }        from '@/hooks/useChartData'
import type { ExportWidget, ExportEndpoint } from '@/lib/types'

interface Props {
  widget:    ExportWidget
  endpoints: ExportEndpoint[]
}

export function WidgetChart({ widget, endpoints }: Props) {
  const endpoint                 = endpoints.find(e => e.id === widget.endpointId)
  const { data, loading, error } = useChartData(endpoint, widget.dataMapping)
  const chartRef                 = useRef<ReactECharts>(null)

  const cardStyle: React.CSSProperties = {
    background:    '#fff',
    border:        '1px solid #e5e7eb',
    borderRadius:  12,
    padding:       '1.25rem',
    boxShadow:     '0 1px 4px rgba(0,0,0,0.05)',
    display:       'flex',
    flexDirection: 'column',
    gap:           12,
  }

  if (loading) return (
    <div id={\`widget-\${widget.id}\`} style={{ ...cardStyle, minHeight: 240, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 8 }}>Loading {widget.title}â€¦</p>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )

  if (error) return (
    <div id={\`widget-\${widget.id}\`} style={cardStyle}>
      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{widget.title}</p>
      <p style={{ color: '#ef4444', fontSize: '0.8rem' }}>Error: {error}</p>
    </div>
  )

  const option = buildEChartsOption(widget, data)

  return (
    <div id={\`widget-\${widget.id}\`} style={cardStyle}>
      <p style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{widget.title}</p>
      {widget.type === 'table'
        ? <DataTable data={data} xAxis={widget.dataMapping.xAxis} />
        : <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: 260, width: '100%' }}
            opts={{ renderer: 'svg' }}
          />
      }
    </div>
  )
}

function buildEChartsOption(widget: ExportWidget, data: Record<string, unknown>[]) {
  const colors  = widget.colors
  const xAxisKey = widget.dataMapping.xAxis
  const yAxisKey = widget.dataMapping.yAxis ?? widget.dataMapping.yAxes?.[0]?.key ?? ''
  const isNum   = data.length > 0 && !isNaN(Number(data[0]?.[yAxisKey]))
  const prepared = isNum
    ? data.slice(0, 30).map((r, i) => ({
        name:  String(r[xAxisKey] ?? i).slice(0, 20),
        value: parseFloat(String(r[yAxisKey])) || 0,
      }))
    : (() => {
        const counts: Record<string, number> = {}
        data.forEach(r => {
          const k = String(r[xAxisKey] ?? 'Unknown')
          counts[k] = (counts[k] ?? 0) + 1
        })
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([name, value]) => ({ name, value }))
      })()

  const xData   = prepared.map(d => d.name)
  const yData   = prepared.map(d => d.value)
  const grid    = { top: 32, right: 16, bottom: 48, left: 52, containLabel: true }
  const tooltip = {
    trigger: 'axis',
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    textStyle: { color: '#f1f5f9', fontSize: 12 },
  }

  switch (widget.type) {
    case 'bar':
    case 'grouped-bar':
    case 'drilldown-bar':
    case 'horizontal-bar':
    case 'horizontal-stacked-bar': return {
      color: colors, tooltip, grid,
      legend: widget.showLegend ? {} : { show: false },
      xAxis: ['horizontal-bar', 'horizontal-stacked-bar'].includes(widget.type)
        ? { type: 'value', splitLine: { show: widget.showGrid } }
        : { type: 'category', data: xData, axisLabel: { fontSize: 11, rotate: xData.length > 8 ? 30 : 0 } },
      yAxis: ['horizontal-bar', 'horizontal-stacked-bar'].includes(widget.type)
        ? { type: 'category', data: xData }
        : { type: 'value', splitLine: { show: widget.showGrid } },
      series: [{
        type: 'bar', data: yData, barMaxWidth: 48, name: yAxisKey,
        stack: widget.type === 'horizontal-stacked-bar' ? 'total' : undefined,
        itemStyle: {
          borderRadius: ['horizontal-bar', 'horizontal-stacked-bar'].includes(widget.type)
            ? [0, widget.barRadius, widget.barRadius, 0]
            : [widget.barRadius, widget.barRadius, 0, 0],
        },
      }],
    }

    case 'line':
    case 'area': return {
      color: colors, tooltip, grid,
      legend: widget.showLegend ? {} : { show: false },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', splitLine: { show: widget.showGrid } },
      series: [{
        type: 'line', data: yData, smooth: true, name: yAxisKey,
        areaStyle: widget.type === 'area' ? { opacity: 0.2 } : undefined,
        lineStyle: { width: 2 },
      }],
    }

    case 'pie':
    case 'donut': return {
      color: colors,
      tooltip: { trigger: 'item' },
      legend: widget.showLegend ? { orient: 'vertical', right: 0 } : { show: false },
      series: [{
        type: 'pie',
        radius: widget.type === 'donut' ? ['40%', '70%'] : '70%',
        data: prepared, label: { fontSize: 11 }, name: widget.title,
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } },
      }],
    }

    case 'gauge': return {
      color: colors,
      series: [{
        type:   'gauge',
        min:    0,
        max:    Math.max(...yData, 100),
        data:   [{ value: yData[0] ?? 0, name: yAxisKey }],
        detail: { fontSize: 18, color: colors[0] },
        axisLine: { lineStyle: { color: [[1, colors[0]]] } },
      }],
    }

    case 'ring-gauge': return {
      color: colors,
      series: [{
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        min: 0,
        max: Math.max(...yData, 100),
        pointer: { show: false },
        progress: {
          show: true,
          roundCap: true,
          width: 16,
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 16,
            color: [[1, '#e2e8f0']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        data: [{ value: yData[0] ?? 0, name: yAxisKey }],
        detail: {
          valueAnimation: true,
          formatter: '{value}',
          color: colors[0],
          fontSize: 28,
          fontWeight: 'bold',
        },
      }],
    }

    // âœ… S5-1 â€” status-card rendered as big KPI number
    case 'status-card': return {
      color: colors,
      graphic: [{
        type: 'text',
        left: 'center',
        top:  'center',
        style: {
          text:      String(yData[0] ?? 'â€”'),
          fontSize:  48,
          fontWeight: 'bold',
          fill:      colors[0] ?? '#6366f1',
        },
      }, {
        type: 'text',
        left: 'center',
        top:  '65%',
        style: {
          text:     yAxisKey,
          fontSize: 13,
          fill:     '#94a3b8',
        },
      }],
    }

    default:
      return { title: { text: widget.title, left: 'center', top: 'center' } }
  }
}

function DataTable({ data, xAxis }: { data: Record<string, unknown>[]; xAxis: string }) {
  if (!data.length) return <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No data</p>
  const cols = Object.keys(data[0])
  return (
    <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 100).map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              {cols.map((c, j) => (
                <td key={j} style={{ padding: '6px 10px', color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
`
}

function generatePDFExport(config: DashboardExportConfig): string {
  return `'use client'
import { useState }         from 'react'
import type { ExportWidget } from '@/lib/types'

interface Props { widgets: ExportWidget[] }

export function PDFExport({ widgets }: Props) {
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(widgets.map(w => w.id)))
  const [loading, setLoading]   = useState(false)

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleExport = async () => {
    setLoading(true)
    try {
      const { default: jsPDF }       = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W     = doc.internal.pageSize.getWidth()
      const H     = doc.internal.pageSize.getHeight()

      // Title page
      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, W, H, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(24)
      doc.text('${config.meta.name}', W / 2, H / 2 - 10, { align: 'center' })
      doc.setFontSize(11)
      doc.setTextColor(148, 163, 184)
      doc.text('Generated: ' + new Date().toLocaleDateString(), W / 2, H / 2 + 8, { align: 'center' })

      for (const wid of Array.from(selected)) {
        const el = document.getElementById(\`widget-\${wid}\`)
        if (!el) continue
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
        const img    = canvas.toDataURL('image/png')
        const ratio  = canvas.height / canvas.width
        const imgW   = W - 20
        const imgH   = Math.min(imgW * ratio, H - 30)
        doc.addPage()
        doc.addImage(img, 'PNG', 10, 10, imgW, imgH)
      }

      doc.save('${slugify(config.meta.name)}-report.pdf')
      setOpen(false)
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '0.5rem 1.25rem', background: '${config.projectConfig.header.accentColor}', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        ðŸ“„ Export PDF
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem' }}>Select Charts for PDF</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>âœ•</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem', cursor: 'pointer', borderRadius: 6, background: '#f8fafc' }}>
                <input type="checkbox"
                  checked={selected.size === widgets.length}
                  onChange={() => setSelected(selected.size === widgets.length ? new Set() : new Set(widgets.map(w => w.id)))}
                />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Select All</span>
              </label>
              {widgets.map(w => (
                <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem 0.6rem', cursor: 'pointer', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
                  <span style={{ fontSize: '0.82rem' }}>{w.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'capitalize' }}>{w.type}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setOpen(false)}
                style={{ flex: 1, padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={handleExport} disabled={loading || selected.size === 0}
                style={{ flex: 2, padding: '0.6rem', background: selected.size === 0 ? '#94a3b8' : '${config.projectConfig.header.accentColor}', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Generatingâ€¦' : \`Export \${selected.size} Chart\${selected.size !== 1 ? 's' : ''}\`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
`
}

function generateAuthGuard(): string {
  return `'use client'
import { useEffect, useState } from 'react'
import { useRouter }           from 'next/navigation'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router      = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const user = localStorage.getItem('authUser')
    if (!user) { router.replace('/login') } else { setOk(true) }
  }, [router])

  if (!ok) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
  return <>{children}</>
}
`
}

function generateDataTransformer(): string {
  return `import type { TransformFilterOperator, TransformOp } from '@/lib/types'

type DataRow = Record<string, unknown>

const hasOwn = (row: DataRow, key: string) =>
  Object.prototype.hasOwnProperty.call(row, key)

const sanitizeNumericString = (value: unknown) =>
  String(value).replace(/[^0-9.\\-]/g, '')

const parseSanitizedNumber = (value: unknown): number | null => {
  const parsed = parseFloat(sanitizeNumericString(value))
  return Number.isNaN(parsed) ? null : parsed
}

const parseComparableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const roundTo2 = (value: number) => Math.round(value * 100) / 100

const compareFilterValues = (
  left: unknown,
  right: unknown,
  operator: TransformFilterOperator,
) => {
  const leftNum = parseComparableNumber(left)
  const rightNum = parseComparableNumber(right)
  const isNumericCompare = leftNum !== null && rightNum !== null

  if (isNumericCompare) {
    switch (operator) {
      case '>':
        return leftNum > rightNum
      case '<':
        return leftNum < rightNum
      case '=':
        return leftNum == rightNum
      case '!=':
        return leftNum != rightNum
      case '>=':
        return leftNum >= rightNum
      case '<=':
        return leftNum <= rightNum
      default:
        return false
    }
  }

  const leftStr = left == null ? '' : String(left)
  const rightStr = right == null ? '' : String(right)
  switch (operator) {
    case '>':
      return leftStr > rightStr
    case '<':
      return leftStr < rightStr
    case '=':
      return leftStr === rightStr
    case '!=':
      return leftStr !== rightStr
    case '>=':
      return leftStr >= rightStr
    case '<=':
      return leftStr <= rightStr
    default:
      return false
  }
}

const applyParseNumber = (rows: DataRow[], op: Extract<TransformOp, { type: 'parse_number' }>) =>
  rows.map(row => {
    if (!hasOwn(row, op.field)) return row
    const parsed = parseFloat(sanitizeNumericString(row[op.field]))
    if (Number.isNaN(parsed)) return row
    return { ...row, [op.field]: parsed }
  })

const applyConcat = (rows: DataRow[], op: Extract<TransformOp, { type: 'concat' }>) =>
  rows.map(row => {
    const values = op.fields
      .filter(field => hasOwn(row, field))
      .map(field => row[field])
      .filter(value => value !== null && value !== undefined && String(value).trim().length > 0)
      .map(value => String(value))

    return {
      ...row,
      [op.outputField]: values.length ? values.join(op.separator) : '',
    }
  })

const applyRename = (rows: DataRow[], op: Extract<TransformOp, { type: 'rename' }>) =>
  rows.map(row => {
    if (!hasOwn(row, op.from)) return row
    const next: DataRow = { ...row, [op.to]: row[op.from] }
    if (op.to !== op.from) {
      delete next[op.from]
    }
    return next
  })

const applyMath = (rows: DataRow[], op: Extract<TransformOp, { type: 'math' }>) =>
  rows.map(row => {
    if (!hasOwn(row, op.field)) return row
    const left = parseSanitizedNumber(row[op.field])
    if (left === null) return row

    const right = Number(op.value)
    if (!Number.isFinite(right)) return row

    let result = 0
    switch (op.operator) {
      case '+':
        result = left + right
        break
      case '-':
        result = left - right
        break
      case '*':
        result = left * right
        break
      case '/':
        result = right === 0 ? 0 : left / right
        break
    }

    return { ...row, [op.outputField]: Number.isFinite(result) ? result : 0 }
  })

const applyPercentOfTotal = (
  rows: DataRow[],
  op: Extract<TransformOp, { type: 'percent_of_total' }>,
) => {
  const numericValues = rows.map(row => parseSanitizedNumber(row[op.field]) ?? 0)
  const total = numericValues.reduce((sum, value) => sum + value, 0)

  return rows.map((row, index) => ({
    ...row,
    [op.outputField]: total === 0 ? 0 : roundTo2((numericValues[index] / total) * 100),
  }))
}

const applyFilterRows = (rows: DataRow[], op: Extract<TransformOp, { type: 'filter_rows' }>) =>
  rows.filter(row => compareFilterValues(row[op.field], op.value, op.operator))

const applySort = (rows: DataRow[], op: Extract<TransformOp, { type: 'sort' }>) => {
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aValue = a.row[op.field]
      const bValue = b.row[op.field]
      const aNum = parseComparableNumber(aValue)
      const bNum = parseComparableNumber(bValue)

      let compare = 0
      if (aNum !== null && bNum !== null) {
        compare = aNum - bNum
      } else {
        const aStr = aValue == null ? '' : String(aValue)
        const bStr = bValue == null ? '' : String(bValue)
        compare = aStr.localeCompare(bStr)
      }

      if (compare !== 0) {
        return op.order === 'asc' ? compare : -compare
      }
      return a.index - b.index
    })

  return sorted.map(item => item.row)
}

const applyLimit = (rows: DataRow[], op: Extract<TransformOp, { type: 'limit' }>) => {
  const count = Math.trunc(op.count)
  if (count <= 0) return rows
  return rows.slice(0, count)
}

const applyTransformOp = (rows: DataRow[], op: TransformOp): DataRow[] => {
  switch (op.type) {
    case 'parse_number':
      return applyParseNumber(rows, op)
    case 'concat':
      return applyConcat(rows, op)
    case 'rename':
      return applyRename(rows, op)
    case 'math':
      return applyMath(rows, op)
    case 'percent_of_total':
      return applyPercentOfTotal(rows, op)
    case 'filter_rows':
      return applyFilterRows(rows, op)
    case 'sort':
      return applySort(rows, op)
    case 'limit':
      return applyLimit(rows, op)
    default:
      return rows
  }
}

export function applyTransforms(rows: DataRow[], ops: TransformOp[]): DataRow[] {
  if (!rows.length || !ops.length) return rows
  return ops.reduce<DataRow[]>((currentRows, op) => applyTransformOp(currentRows, op), rows)
}
`
}

function generateReadme(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  return `# ${config.meta.name}

> Generated by **Analytics AI Dashboard Builder** Â· ${new Date(config.meta.exportedAt).toLocaleDateString()}
> Client: **${pc.clientName}** Â· Auth: **${pc.authStrategy}**

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000)

## Login

- Endpoint: \`${pc.login.endpoint}\`
- Username field: \`${pc.login.usernameField}\`
- Token path: \`${pc.login.tokenPath}\`

## Widgets (${config.widgets.length})

${config.widgets.map(w => `- **${w.title}** â€” \`${w.type}\` Â· X: \`${w.dataMapping.xAxis}\` Â· Y: \`${w.dataMapping.yAxis || 'â€”'}\``).join('\n')}

## Groups (${config.groups.length})

${config.groups.map(g => `- **${g.name}** â€” ${g.widgetIds.length} charts`).join('\n') || '_No groups defined_'}

## Endpoints

${config.endpoints.map(e => `- **${e.name}**: \`${e.method} ${e.url}\``).join('\n')}
`
}

// âœ… stray `i` removed â€” was causing TypeScript parse error
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dashboard'
}

