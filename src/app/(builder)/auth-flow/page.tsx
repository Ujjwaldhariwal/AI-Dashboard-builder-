'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useDashboardStore } from '@/store/builder-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AuthStrategy, EncodingType } from '@/types/project-config'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import {
  clearBuilderDemoAuthSession,
  getBuilderDemoAuthSession,
  getBuilderDemoAuthTokenMeta,
  setBuilderDemoAuthSession,
} from '@/lib/auth/demo-auth-session'

interface DemoLoginResult {
  success: boolean
  statusCode?: number
  latencyMs?: number
  token?: string
  message?: string
  payload?: unknown
}

const BOSCH_LOGIN_PAYLOAD_KEY = 'mhgj70aizasybty01ob6mfvqoh0fj6rwvjluukcw8mjr04pkjh'

const STEP_LABELS = [
  'Access / Login',
  'API Configuration',
  'Token / Session Status',
  'Test Connection',
]

function joinUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  const path = endpoint.trim()
  if (!base && !path) return ''
  if (!path) return base
  if (!base) return path
  return `${base}/${path.replace(/^\/+/, '')}`
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getApiMessage(payload: unknown): string | undefined {
  const record = asRecord(payload)
  if (!record) return undefined
  const message = record.message
  return typeof message === 'string' ? message : undefined
}

function isLogicalFailure(payload: unknown): boolean {
  const record = asRecord(payload)
  if (!record) return false

  const status = record.status
  if (typeof status === 'boolean') return status === false

  const success = record.success
  if (typeof success === 'boolean') return success === false

  return false
}

function asToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function resolveLoginToken(payload: unknown, preferredPath: string): string | undefined {
  const preferred = preferredPath ? asToken(extractByPath(payload, preferredPath)) : undefined
  if (preferred) return preferred

  const fallbackPaths = ['token', 'data.token', 'data.data.token']
  for (const path of fallbackPaths) {
    const candidate = asToken(extractByPath(payload, path))
    if (candidate) return candidate
  }
  return undefined
}

function maskToken(token: string): string {
  if (!token) return ''
  if (token.length <= 12) return token
  return `${token.slice(0, 6)}...${token.slice(-6)}`
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

function StepCard({
  step,
  title,
  subtitle,
  children,
}: {
  step: number
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge variant="outline" className="h-6 px-2 text-[10px]">
            Step {step}
          </Badge>
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
      </CardContent>
    </Card>
  )
}

export default function AuthFlowPage() {
  const currentDashboardId = useDashboardStore((state) => state.currentDashboardId)
  const getProjectConfig = useDashboardStore((state) => state.getProjectConfig)
  const setProjectConfig = useDashboardStore((state) => state.setProjectConfig)

  const [baseUrl, setBaseUrl] = useState('')
  const [endpoint, setEndpoint] = useState('/userLogin')
  const [usernameField, setUsernameField] = useState('username')
  const [passwordField, setPasswordField] = useState('password')
  const [tokenPath, setTokenPath] = useState('data.token')
  const [authStrategy, setAuthStrategy] = useState<AuthStrategy>('none')
  const [encodingType, setEncodingType] = useState<EncodingType>('plain')
  const [logoutOn401, setLogoutOn401] = useState(true)
  const [logoutOnMsg, setLogoutOnMsg] = useState('expired')
  const [tokenHeaderName, setTokenHeaderName] = useState('Authorization')
  const [tokenPrefix, setTokenPrefix] = useState('Bearer')
  const [autoApplyToken, setAutoApplyToken] = useState(true)

  const [demoUsername, setDemoUsername] = useState('')
  const [demoPassword, setDemoPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<DemoLoginResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [sessionToken, setSessionToken] = useState('')
  const [sessionClockMs, setSessionClockMs] = useState(() => Date.now())
  const [showAdvanced, setShowAdvanced] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const syncSessionState = useCallback(() => {
    const session = getBuilderDemoAuthSession()
    setSessionToken(session?.token ?? '')
    setSessionClockMs(Date.now())
  }, [])

  useEffect(() => {
    syncSessionState()
    const listener = () => syncSessionState()
    window.addEventListener('builderDemoAuthSessionChanged', listener)
    return () => window.removeEventListener('builderDemoAuthSessionChanged', listener)
  }, [syncSessionState])

  useEffect(() => {
    if (!currentDashboardId) return
    const config = getProjectConfig(currentDashboardId)

    setBaseUrl(config.baseUrl ?? '')
    setEndpoint(config.login.endpoint ?? '/userLogin')
    setUsernameField(config.login.usernameField ?? 'username')
    setPasswordField(config.login.passwordField ?? 'password')
    setTokenPath(config.login.tokenPath ?? 'data.token')
    setAuthStrategy(config.authStrategy ?? 'none')
    setEncodingType(config.login.encodingType ?? 'plain')
    setLogoutOn401(config.session.logoutOn401 ?? true)
    setLogoutOnMsg(config.session.logoutOnMessage ?? 'expired')
    setTokenHeaderName(config.login.tokenHeaderName ?? 'Authorization')
    setTokenPrefix(config.login.tokenPrefix ?? 'Bearer')
    setAutoApplyToken(config.login.passTokenToApis ?? true)
    setResult(null)
    setShowAdvanced(false)
  }, [currentDashboardId, getProjectConfig])

  useEffect(() => {
    if (!sessionToken) return
    const timer = window.setInterval(() => setSessionClockMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sessionToken])

  const isDisabled = !currentDashboardId
  const fullUrl = useMemo(() => joinUrl(baseUrl, endpoint), [baseUrl, endpoint])
  const tokenMeta = useMemo(
    () => (sessionToken ? getBuilderDemoAuthTokenMeta(sessionToken, sessionClockMs) : null),
    [sessionClockMs, sessionToken],
  )

  const applyBoschPreset = () => {
    setBaseUrl('/api/bosch')
    setEndpoint('/userLogin')
    setAuthStrategy('none')
    setEncodingType('btoa')
    setUsernameField(BOSCH_LOGIN_PAYLOAD_KEY)
    setPasswordField('password')
    setTokenPath('token')
    setTokenHeaderName('Authorization')
    setTokenPrefix('Bearer')
    setAutoApplyToken(true)
    toast.success('Bosch login preset applied')
  }

  const activateDemoSession = (token: string) => {
    if (!token.trim()) {
      toast.error('Token is empty. Cannot activate session.')
      return
    }

    setBuilderDemoAuthSession({
      dashboardId: currentDashboardId ?? undefined,
      token: token.trim(),
      headerName: tokenHeaderName.trim() || 'Authorization',
      prefix: tokenPrefix,
      enabled: true,
      createdAt: new Date().toISOString(),
    })

    toast.success('Demo token activated for API calls')
  }

  const clearDemoSession = () => {
    clearBuilderDemoAuthSession()
    toast.success('Demo token session cleared')
  }

  const handleDemoLogin = async () => {
    if (!fullUrl) {
      toast.error('Base URL and login endpoint are required')
      return
    }
    if (!demoUsername || !demoPassword) {
      toast.error('Enter demo username and password')
      return
    }

    setTesting(true)
    setResult(null)
    const start = performance.now()

    try {
      const headers: Record<string, string> = {}
      const body: Record<string, string> = {}

      if (authStrategy === 'basic' && encodingType === 'none') {
        headers.Authorization = `Basic ${btoa(`${demoUsername}:${demoPassword}`)}`
      } else if (encodingType === 'btoa') {
        body[usernameField] = btoa(`${demoUsername}:${demoPassword}`)
      } else {
        body[usernameField] = demoUsername
        if (passwordField) body[passwordField] = demoPassword
      }

      const response = await fetch(
        fullUrl,
        buildEndpointRequestInit({
          method: 'POST',
          headers,
          body,
          applyDemoAuth: false,
        }),
      )

      const latencyMs = Math.round(performance.now() - start)
      const payload = await response.json().catch(() => null)
      const apiMessage = getApiMessage(payload)
      const failedByBody = isLogicalFailure(payload)
      const success = response.ok && !failedByBody

      const token = resolveLoginToken(payload, tokenPath)

      const nextResult: DemoLoginResult = {
        success,
        statusCode: response.status,
        latencyMs,
        token,
        message: apiMessage,
        payload,
      }

      setResult(nextResult)

      if (!success) {
        toast.error(apiMessage || `Login failed (HTTP ${response.status})`)
        return
      }

      if (!token) {
        toast.warning('Login passed but token was not found at the token path')
        return
      }

      toast.success('Login succeeded and token captured')

      if (autoApplyToken) {
        activateDemoSession(token)
      }
    } catch (error) {
      const latencyMs = Math.round(performance.now() - start)
      const message = error instanceof Error ? error.message : 'Unknown request error'
      setResult({
        success: false,
        latencyMs,
        message,
      })
      toast.error(`Request failed: ${message}`)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (!currentDashboardId) {
      toast.error('No active dashboard selected')
      return
    }

    setProjectConfig(currentDashboardId, {
      baseUrl,
      authStrategy,
      login: {
        endpoint,
        usernameField,
        passwordField,
        tokenPath,
        encodingType,
        passTokenToApis: autoApplyToken,
        tokenHeaderName,
        tokenPrefix,
      },
      session: {
        logoutOn401,
        logoutOnMessage: logoutOnMsg,
      },
    })

    setSaving(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaving(false), 1500)
    toast.success('Auth setup saved')
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Auth Setup</h1>
        <p className="text-sm text-muted-foreground">
          Simple setup for login endpoint, token capture, session state, and connection testing.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {STEP_LABELS.map((label, index) => (
            <div key={label} className="flex items-center gap-1.5">
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {index + 1}
              </Badge>
              <span>{label}</span>
              {index < STEP_LABELS.length - 1 && <ChevronRight className="w-3 h-3" />}
            </div>
          ))}
        </div>
      </div>

      {!currentDashboardId && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Select a dashboard in{' '}
          <Link href="/workspaces" className="underline font-medium">
            Workspaces
          </Link>{' '}
          first.
        </div>
      )}

      <StepCard
        step={1}
        title="Access / Login"
        subtitle="Set the base URL and login endpoint used for session bootstrap."
      >
        <Field label="API Base URL">
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="/api/bosch"
            className="font-mono text-xs"
            disabled={isDisabled}
          />
        </Field>

        <Field label="Login Endpoint">
          <Input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="/userLogin"
            className="font-mono text-xs"
            disabled={isDisabled}
          />
        </Field>

        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={applyBoschPreset}
          disabled={isDisabled}
        >
          Apply Bosch Preset
        </Button>

        <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-[11px] font-mono text-muted-foreground">
          POST {fullUrl || '<base-url>/<login-endpoint>'}
        </div>
      </StepCard>

      <StepCard
        step={2}
        title="API Configuration"
        subtitle="Use default mapping for most APIs. Open advanced settings only when required."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Username field key">
            <Input
              value={usernameField}
              onChange={(event) => setUsernameField(event.target.value)}
              placeholder="username"
              className="font-mono text-xs"
              disabled={isDisabled}
            />
          </Field>
          <Field label="Password field key">
            <Input
              value={passwordField}
              onChange={(event) => setPasswordField(event.target.value)}
              placeholder="password"
              className="font-mono text-xs"
              disabled={isDisabled}
            />
          </Field>
        </div>

        <Field label="Token path">
          <Input
            value={tokenPath}
            onChange={(event) => setTokenPath(event.target.value)}
            placeholder="data.token"
            className="font-mono text-xs"
            disabled={isDisabled}
          />
        </Field>

        <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
          Most setups only need base URL, endpoint, username/password field keys, and token path.
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((value) => !value)}
            disabled={isDisabled}
          >
            {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
          </Button>
        </div>

        {showAdvanced && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Auth strategy">
                <Select
                  value={authStrategy}
                  onValueChange={(value) => setAuthStrategy(value as AuthStrategy)}
                  disabled={isDisabled}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="bearer">Bearer</SelectItem>
                    <SelectItem value="api-key">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Credential encoding">
                <Select
                  value={encodingType}
                  onValueChange={(value) => setEncodingType(value as EncodingType)}
                  disabled={isDisabled}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plain">Plain</SelectItem>
                    <SelectItem value="btoa">btoa(username:password)</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Token header name">
                <Input
                  value={tokenHeaderName}
                  onChange={(event) => setTokenHeaderName(event.target.value)}
                  className="font-mono text-xs"
                  placeholder="Authorization"
                  disabled={isDisabled}
                />
              </Field>
              <Field label="Token prefix">
                <Input
                  value={tokenPrefix}
                  onChange={(event) => setTokenPrefix(event.target.value)}
                  className="font-mono text-xs"
                  placeholder="Bearer"
                  disabled={isDisabled}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded border px-3 py-2">
              <Label className="text-xs">Auto logout on HTTP 401</Label>
              <Switch checked={logoutOn401} onCheckedChange={setLogoutOn401} disabled={isDisabled} />
            </div>

            <Field label="Logout message contains">
              <Input
                value={logoutOnMsg}
                onChange={(event) => setLogoutOnMsg(event.target.value)}
                className="font-mono text-xs"
                placeholder="expired"
                disabled={isDisabled}
              />
            </Field>
          </div>
        )}
      </StepCard>

      <StepCard
        step={3}
        title="Token / Session Status"
        subtitle="Control whether the captured token is auto-applied to API and chart calls."
      >
        <div className="flex items-center justify-between rounded border px-3 py-2">
          <Label className="text-xs">Apply token to all API/chart calls</Label>
          <Switch checked={autoApplyToken} onCheckedChange={setAutoApplyToken} disabled={isDisabled} />
        </div>

        <div className="rounded-lg border p-3 bg-muted/20">
          {sessionToken ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-semibold">Active token session</span>
              </div>
              {tokenMeta?.isExpired ? (
                <p className="text-[11px] text-red-600 font-medium">
                  Token expired. Re-run login test and activate the latest token.
                </p>
              ) : tokenMeta?.remainingMs !== null && tokenMeta?.remainingMs !== undefined ? (
                <p className="text-[11px] text-muted-foreground">
                  Expires in {formatRemainingTime(tokenMeta.remainingMs)}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Expiry unavailable (token has no `exp` claim).
                </p>
              )}
              <p className="text-[11px] text-muted-foreground font-mono break-all">
                {(tokenHeaderName || 'Authorization')}: {tokenPrefix ? `${tokenPrefix} ` : ''}
                {maskToken(sessionToken)}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="w-4 h-4" />
              <span className="text-xs">No active token session</span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => result?.token && activateDemoSession(result.token)}
            disabled={!result?.token || isDisabled}
          >
            Activate Captured Token
          </Button>
          <Button variant="outline" className="flex-1" onClick={clearDemoSession} disabled={isDisabled}>
            Clear Session
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          For quick troubleshooting, use the same session indicator in{' '}
          <Link href="/api-config" className="underline">
            API Config
          </Link>
          .
        </p>
      </StepCard>

      <StepCard
        step={4}
        title="Test Connection"
        subtitle="Run a demo login, inspect response state, and validate token extraction."
      >
        <Field label="Demo username">
          <Input
            value={demoUsername}
            onChange={(event) => setDemoUsername(event.target.value)}
            placeholder="Enter username"
            disabled={isDisabled}
          />
        </Field>

        <Field label="Demo password">
          <div className="relative">
            <Input
              type={showPass ? 'text' : 'password'}
              value={demoPassword}
              onChange={(event) => setDemoPassword(event.target.value)}
              placeholder="Enter password"
              className="pr-10"
              disabled={isDisabled}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
              onClick={() => setShowPass((value) => !value)}
            >
              {showPass ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </Field>

        <Button className="w-full" onClick={handleDemoLogin} disabled={testing || isDisabled || !fullUrl}>
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing Login...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Run Login Test
            </>
          )}
        </Button>

        {result && (
          <div
            className={`rounded-lg border p-3 space-y-2 ${
              result.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
            }`}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className="text-xs font-semibold">
                {result.success ? 'Connection succeeded' : 'Connection failed'}
              </span>
              {typeof result.statusCode === 'number' && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  HTTP {result.statusCode}
                </Badge>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground flex items-center gap-3">
              {typeof result.latencyMs === 'number' && <span>{result.latencyMs} ms</span>}
              <span>Token: {result.token ? 'captured' : 'not captured'}</span>
            </div>

            {result.message && (
              <p className="text-[11px] text-muted-foreground">Message: {result.message}</p>
            )}

            {result.token && (
              <div className="rounded border bg-background/80 px-2 py-1.5 text-[10px] font-mono break-all">
                {tokenPath || 'token'}: {maskToken(result.token)}
              </div>
            )}

            {result.payload !== undefined && (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-muted-foreground">View response payload</summary>
                <pre className="mt-2 rounded border bg-background/80 p-2 max-h-52 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </StepCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isDisabled}>
          {saving ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Saved
            </>
          ) : (
            <>
              <Shield className="w-4 h-4 mr-2" />
              Save Auth Setup
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
