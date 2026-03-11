'use client'

// src/app/(builder)/auth-flow/page.tsx
// Auth Flow Config + Live Login Tester

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDashboardStore } from '@/store/builder-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Shield, CheckCircle2, XCircle, Loader2,
  Eye, EyeOff, Zap, Copy, AlertCircle,
  ChevronRight, Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AuthStrategy, EncodingType } from '@/types/project-config'
import { AnimatePresence, motion } from 'framer-motion'

// ── Fix #6 — type-safe const arrays for Select validation ──────────────────
const AUTH_STRATEGIES = ['basic', 'bearer', 'api-key', 'none'] as const
const ENCODING_TYPES = ['plain', 'btoa', 'none'] as const
type SetupMode = 'simple' | 'advanced'
type AuthPresetId = 'rest_json' | 'basic_auth' | 'api_key' | 'service_proxy'

type AuthPreset = {
  id: AuthPresetId
  label: string
  description: string
  values: {
    authStrategy: AuthStrategy
    encodingType: EncodingType
    endpoint: string
    usernameField: string
    passwordField: string
    tokenPath: string
    logoutOn401: boolean
    logoutOnMsg: string
  }
}

const AUTH_PRESETS: AuthPreset[] = [
  {
    id: 'rest_json',
    label: 'REST JSON Login',
    description: 'Most common pattern. Username + password in request body.',
    values: {
      authStrategy: 'basic',
      encodingType: 'plain',
      endpoint: '/userLogin',
      usernameField: 'username',
      passwordField: 'password',
      tokenPath: 'data.token',
      logoutOn401: true,
      logoutOnMsg: 'expired',
    },
  },
  {
    id: 'basic_auth',
    label: 'Basic Header Auth',
    description: 'Credentials sent as Basic Authorization header.',
    values: {
      authStrategy: 'basic',
      encodingType: 'none',
      endpoint: '/userLogin',
      usernameField: 'username',
      passwordField: 'password',
      tokenPath: 'data.token',
      logoutOn401: true,
      logoutOnMsg: 'expired',
    },
  },
  {
    id: 'api_key',
    label: 'API Key / Bearer',
    description: 'Token-based APIs where login is optional or external.',
    values: {
      authStrategy: 'api-key',
      encodingType: 'none',
      endpoint: '/token',
      usernameField: 'username',
      passwordField: 'password',
      tokenPath: 'token',
      logoutOn401: true,
      logoutOnMsg: 'expired',
    },
  },
  {
    id: 'service_proxy',
    label: 'Service Proxy',
    description: 'For proxy-based service calls (Bosch-style static headers).',
    values: {
      authStrategy: 'none',
      encodingType: 'none',
      endpoint: '/api/proxy/data',
      usernameField: 'username',
      passwordField: 'password',
      tokenPath: '',
      logoutOn401: false,
      logoutOnMsg: '',
    },
  },
]

function isAuthStrategy(v: string): v is AuthStrategy {
  return AUTH_STRATEGIES.includes(v as AuthStrategy)
}
function isEncodingType(v: string): v is EncodingType {
  return ENCODING_TYPES.includes(v as EncodingType)
}

interface TestResult {
  success: boolean
  statusCode?: number
  latencyMs?: number
  tokenFound?: string
  tokenPath?: string
  rawResponse?: unknown
  error?: string
}

function joinUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  const path = endpoint.trim()
  if (!base && !path) return ''
  if (!path) return base
  if (!base) return path
  return `${base}/${path.replace(/^\/+/, '')}`
}

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
    .then(() => toast.success('Copied'))
    .catch(() => toast.error('Copy failed'))
}

function extractByPath(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined
  return path
    .split('.')
    .reduce((curr: unknown, key) => {
      if (!curr || typeof curr !== 'object') return undefined
      return (curr as Record<string, unknown>)[key]
    }, obj)
}

export default function AuthFlowPage() {
  const currentDashboardId = useDashboardStore(s => s.currentDashboardId)
  const getProjectConfig = useDashboardStore(s => s.getProjectConfig)
  const setProjectConfig = useDashboardStore(s => s.setProjectConfig)

  // Local state mirrors ProjectConfig fields
  const [baseUrl, setBaseUrl] = useState('')
  const [endpoint, setEndpoint] = useState('/userLogin')
  const [usernameField, setUsernameField] = useState('username')
  const [passwordField, setPasswordField] = useState('password')
  const [tokenPath, setTokenPath] = useState('data.token')
  const [authStrategy, setAuthStrategy] = useState<AuthStrategy>('basic')
  const [encodingType, setEncodingType] = useState<EncodingType>('plain')
  const [logoutOn401, setLogoutOn401] = useState(true)
  const [logoutOnMsg, setLogoutOnMsg] = useState('expired')
  const [setupMode, setSetupMode] = useState<SetupMode>('simple')
  const [selectedPreset, setSelectedPreset] = useState<AuthPresetId>('rest_json')

  // Test credentials (never persisted)
  const [testUser, setTestUser] = useState('')
  const [testPass, setTestPass] = useState('')
  const [showPass, setShowPass] = useState(false)

  // UI state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [saved, setSaved] = useState(false)

  // ── Fix #2 — useRef to track timer and prevent state leak on unmount ──────
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!currentDashboardId) return
    const cfg = getProjectConfig(currentDashboardId)
    setBaseUrl(cfg.baseUrl ?? '')
    setEndpoint(cfg.login.endpoint ?? '/userLogin')
    setUsernameField(cfg.login.usernameField ?? 'username')
    setPasswordField(cfg.login.passwordField ?? 'password')
    setTokenPath(cfg.login.tokenPath ?? 'data.token')
    setAuthStrategy(cfg.authStrategy ?? 'basic')
    setEncodingType(cfg.login.encodingType ?? 'plain')
    setLogoutOn401(cfg.session.logoutOn401 ?? true)
    setLogoutOnMsg(cfg.session.logoutOnMessage ?? 'expired')
    setTestResult(null)
    setSaved(false)
  }, [currentDashboardId, getProjectConfig])

  const fullUrl = useMemo(() => joinUrl(baseUrl, endpoint), [baseUrl, endpoint])

  const previewPayload = useMemo(() => {
    if (encodingType === 'none') return {}
    if (encodingType === 'btoa') {
      return { [usernameField]: 'btoa(username:password)' }
    }
    return {
      [usernameField]: 'username',
      [passwordField]: 'password',
    }
  }, [encodingType, passwordField, usernameField])

  const handleTest = async () => {
    if (!fullUrl) {
      toast.error('Base URL and login endpoint are required')
      return
    }

    setTesting(true)
    setTestResult(null)
    const started = performance.now()

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const body: Record<string, string> = {}

      // ── Fix #3 — mutually exclusive credential encoding logic ─────────────
      // Basic Auth → credentials go in Authorization header ONLY
      // btoa encoding → credentials go in body as base64 ONLY
      // plain → credentials go in body as-is
      if (authStrategy === 'basic') {
        headers.Authorization = `Basic ${btoa(`${testUser}:${testPass}`)}`
        // body intentionally left empty for basic auth
      } else if (encodingType === 'btoa') {
        body[usernameField] = btoa(`${testUser}:${testPass}`)
      } else if (encodingType === 'plain') {
        body[usernameField] = testUser
        body[passwordField] = testPass
      }

      const res = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      const latencyMs = Math.round(performance.now() - started)
      const rawJson = await res.json().catch(() => null)
      const token = extractByPath(rawJson, tokenPath)

      const result: TestResult = {
        success: res.ok,
        statusCode: res.status,
        latencyMs,
        tokenFound: token ? String(token) : undefined,
        tokenPath,
        rawResponse: rawJson,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      }
      setTestResult(result)

      if (res.ok && result.tokenFound) {
        toast.success('Login successful and token extracted')
      } else if (res.ok) {
        toast.warning(`Login successful, but token not found at "${tokenPath}"`)
      } else {
        toast.error(`Login failed: HTTP ${res.status}`)
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - started)
      const message = err instanceof Error ? err.message : 'Unknown error'
      setTestResult({ success: false, latencyMs, error: message })
      toast.error(`Request failed: ${message}`)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (!currentDashboardId) {
      toast.error('No active dashboard. Select one from Workspaces first.')
      return
    }

    setProjectConfig(currentDashboardId, {
      baseUrl,
      authStrategy,
      login: { endpoint, usernameField, passwordField, tokenPath, encodingType },
      session: { logoutOn401, logoutOnMessage: logoutOnMsg },
    })

    // ── Fix #2 — clear previous timer before starting new one ────────────────
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaved(true)
    savedTimerRef.current = setTimeout(() => setSaved(false), 1800)
    toast.success('Auth config saved. Export ZIP will use this flow.')
  }

  const applyPreset = (id: AuthPresetId) => {
    const preset = AUTH_PRESETS.find(p => p.id === id)
    if (!preset) return
    setSelectedPreset(id)
    setAuthStrategy(preset.values.authStrategy)
    setEncodingType(preset.values.encodingType)
    setEndpoint(preset.values.endpoint)
    setUsernameField(preset.values.usernameField)
    setPasswordField(preset.values.passwordField)
    setTokenPath(preset.values.tokenPath)
    setLogoutOn401(preset.values.logoutOn401)
    setLogoutOnMsg(preset.values.logoutOnMsg)
    toast.success(`Preset applied: ${preset.label}`)
  }

  // ── Fix #5 — disable all inputs when no dashboard is active ──────────────
  const isDisabled = !currentDashboardId

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Auth Flow Config</h1>
            <p className="text-sm text-muted-foreground">
              Configure login and token extraction for generated dashboards.
            </p>
          </div>
        </div>

        {!currentDashboardId && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-sm px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            No dashboard selected. Open a dashboard from Workspaces first.
          </div>
        )}
      </div>

      <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Quick Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Mode:</span>
            <Button
              type="button"
              size="sm"
              variant={setupMode === 'simple' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setSetupMode('simple')}
            >
              Simple
            </Button>
            <Button
              type="button"
              size="sm"
              variant={setupMode === 'advanced' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setSetupMode('advanced')}
            >
              Advanced
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {AUTH_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                disabled={isDisabled}
                onClick={() => applyPreset(preset.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selectedPreset === preset.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <p className="text-xs font-semibold">{preset.label}</p>
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Use <span className="font-medium">Simple</span> for quick onboarding. Switch to
            <span className="font-medium"> Advanced</span> for full field-level control.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Config */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                Endpoint
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="API Base URL">
                <Input
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.yourproject.com"
                  className="font-mono text-xs"
                  disabled={isDisabled}
                />
              </Field>

              <Field label="Login Endpoint Path">
                <Input
                  value={endpoint}
                  onChange={e => setEndpoint(e.target.value)}
                  placeholder="/userLogin"
                  className="font-mono text-xs"
                  disabled={isDisabled}
                />
              </Field>

              <div className="rounded-lg bg-muted px-2.5 py-2 flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-[11px] font-mono text-muted-foreground truncate">
                  POST {fullUrl || 'https://api.example.com/userLogin'}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(fullUrl)}
                  className="ml-auto p-1 rounded hover:bg-background"
                  title="Copy URL"
                  disabled={isDisabled}
                >
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-500" />
                Auth Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Strategy">
                {/* ── Fix #6 — type-safe onValueChange with predicate guard ── */}
                <Select
                  value={authStrategy}
                  onValueChange={v => { if (isAuthStrategy(v)) setAuthStrategy(v) }}
                  disabled={isDisabled}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="api-key">API Key</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {setupMode === 'advanced' && (
                <>
                  <Field label="Credential Encoding">
                    <Select
                      value={encodingType}
                      onValueChange={v => { if (isEncodingType(v)) setEncodingType(v) }}
                      disabled={isDisabled}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plain">Plain (send as-is)</SelectItem>
                        <SelectItem value="btoa">btoa (base64 user:pass)</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Username field key">
                      <Input
                        value={usernameField}
                        onChange={e => setUsernameField(e.target.value)}
                        placeholder="username"
                        className="font-mono text-xs"
                        disabled={isDisabled}
                      />
                    </Field>
                    <Field label="Password field key">
                      <Input
                        value={passwordField}
                        onChange={e => setPasswordField(e.target.value)}
                        placeholder="password"
                        className="font-mono text-xs"
                        disabled={isDisabled}
                      />
                    </Field>
                  </div>
                </>
              )}

              <Field label="Token path (dot notation)">
                <Input
                  value={tokenPath}
                  onChange={e => setTokenPath(e.target.value)}
                  placeholder="data.token"
                  className="font-mono text-xs"
                  disabled={isDisabled}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {setupMode === 'simple'
                    ? 'Tip: if your API does not return a token, leave this blank.'
                    : <>Example: <code>data.token</code> or <code>result.access_token</code></>
                  }
                </p>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                Session Expiry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Auto logout on HTTP 401</Label>
                <Switch
                  checked={logoutOn401}
                  onCheckedChange={setLogoutOn401}
                  disabled={isDisabled}
                />
              </div>
              {setupMode === 'advanced' && (
                <Field label="Logout on message containing">
                  <Input
                    value={logoutOnMsg}
                    onChange={e => setLogoutOnMsg(e.target.value)}
                    placeholder="expired"
                    className="font-mono text-xs"
                    disabled={isDisabled}
                  />
                </Field>
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2"
            onClick={handleSave}
            disabled={isDisabled}
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Saved to Project Config
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                Save Auth Config
              </>
            )}
          </Button>
        </div>

        {/* Right: Tester + Preview */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Live Login Tester
                <Badge variant="outline" className="ml-auto text-[9px]">Optional</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* ── Fix #4 — CORS warning ──────────────────────────────────── */}
              <p className="text-[11px] text-muted-foreground">
                Test your login endpoint. Credentials are used only for this request and not saved.
              </p>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  The API must allow CORS from <code>localhost</code>.
                  If you see a network error, the API is blocking browser requests — this is normal
                  for production APIs. The saved config will still work in the exported ZIP.
                </p>
              </div>

              <Field label="Test Username">
                <Input
                  value={testUser}
                  onChange={e => setTestUser(e.target.value)}
                  placeholder="Enter test username"
                  className="text-xs"
                />
              </Field>

              <Field label="Test Password">
                <div className="relative">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    value={testPass}
                    onChange={e => setTestPass(e.target.value)}
                    placeholder="Enter test password"
                    className="text-xs pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                    title={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass
                      ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                      : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </Field>

              <Button
                onClick={handleTest}
                className="w-full gap-2"
                disabled={testing || !fullUrl}
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing Login...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Run Live Test
                  </>
                )}
              </Button>

              <AnimatePresence initial={false}>
                {testResult && (
                  <motion.div
                    key="test-result"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className={`rounded-lg border p-3 space-y-2 ${
                      testResult.success
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-red-500/30 bg-red-500/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {testResult.success
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        : <XCircle className="w-4 h-4 text-red-500" />}
                      <span className="text-xs font-semibold">
                        {testResult.success ? 'Login Passed' : 'Login Failed'}
                      </span>
                      {typeof testResult.statusCode === 'number' && (
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          HTTP {testResult.statusCode}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      {typeof testResult.latencyMs === 'number' && (
                        <span>{testResult.latencyMs} ms</span>
                      )}
                      <span>Token: {testResult.tokenFound ? 'found' : 'not found'}</span>
                    </div>

                    {testResult.tokenFound && (
                      <div className="rounded bg-background/80 border px-2 py-1.5 text-[10px] font-mono break-all">
                        {testResult.tokenPath}: {testResult.tokenFound}
                      </div>
                    )}

                    {testResult.error && (
                      <p className="text-[11px] text-red-500">{testResult.error}</p>
                    )}

                    {testResult.rawResponse !== undefined && (
                      <details className="text-[10px]">
                        <summary className="cursor-pointer text-muted-foreground">
                          View response payload
                        </summary>
                        <pre className="mt-2 rounded bg-background/80 border p-2 max-h-44 overflow-auto whitespace-pre-wrap">
                          {JSON.stringify(testResult.rawResponse, null, 2)}
                        </pre>
                      </details>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Generated Config Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                This is the shape saved into <code>projectConfig</code> for ZIP generation.
              </p>
              <div className="rounded-lg border bg-muted/30 p-3">
                <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap max-h-56 overflow-auto">
                  {JSON.stringify({
                    baseUrl,
                    authStrategy,
                    login: { endpoint, usernameField, passwordField, tokenPath, encodingType },
                    session: { logoutOn401, logoutOnMessage: logoutOnMsg },
                    payloadPreview: previewPayload,
                  }, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Fix #1 — ReactNode imported from react, not referenced via React.ReactNode
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
