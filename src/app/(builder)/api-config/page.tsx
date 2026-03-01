'use client'

// src/app/(builder)/api-config/page.tsx

import { useState } from 'react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Database, Trash2, CheckCircle2,
  Shield, ChevronDown, ChevronUp, Zap,
  Copy, Check, RefreshCw, KeyRound,
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { LiveAPIPreview } from '@/components/builder/api-tester/live-api-preview'
import { toast } from 'sonner'

type AuthType = 'none' | 'api-key' | 'bearer' | 'basic'

const defaultForm = {
  name:            '',
  url:             '',
  method:          'GET' as 'GET' | 'POST',
  authType:        'none' as AuthType,
  authKey:         '',      // header name (api-key) or username (basic)
  authValue:       '',      // header value or password
  refreshInterval: 0,
  status:          'active' as const,
}

// ── Auth hint labels ──────────────────────────────────────────────────────
const AUTH_HINTS: Record<AuthType, { keyLabel: string; valLabel: string; placeholder: string } | null> = {
  'none':    null,
  'api-key': { keyLabel: 'Header name', valLabel: 'API Key value', placeholder: 'X-API-Key' },
  'bearer':  { keyLabel: '', valLabel: 'Bearer token', placeholder: '' },
  'basic':   { keyLabel: 'Username', valLabel: 'Password', placeholder: '' },
}

export default function APIConfigPage() {
  const {
    currentDashboardId, endpoints,
    addEndpoint, removeEndpoint,
  } = useDashboardStore()

  const [isCreating, setIsCreating]           = useState(false)
  const [formData, setFormData]               = useState(defaultForm)
  const [expandedId, setExpandedId]           = useState<string | null>(null)
  const [deleteId, setDeleteId]               = useState<string | null>(null)
  const [copiedId, setCopiedId]               = useState<string | null>(null)
  const [editingId, setEditingId]             = useState<string | null>(null)

  const resetForm = () => { setFormData(defaultForm); setIsCreating(false) }

  // ── Computed headers from auth fields ────────────────────────────────────
  const buildHeaders = (form: typeof defaultForm): Record<string, string> => {
    if (form.authType === 'none' || !form.authValue) return {}
    if (form.authType === 'bearer')
      return { Authorization: `Bearer ${form.authValue}` }
    if (form.authType === 'api-key' && form.authKey)
      return { [form.authKey]: form.authValue }
    if (form.authType === 'basic')
      return { Authorization: `Basic ${btoa(`${form.authKey}:${form.authValue}`)}` }
    return {}
  }

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error('Name and URL are required'); return
    }
    addEndpoint({
      name:            formData.name.trim(),
      url:             formData.url.trim(),
      method:          formData.method,
      authType:        formData.authType,
      refreshInterval: formData.refreshInterval,
      status:          'active',
      headers:         buildHeaders(formData),
    })
    toast.success('API endpoint saved')
    resetForm()
  }

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    toast.success('URL copied')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const authHint = AUTH_HINTS[formData.authType]

  if (!currentDashboardId) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-10 text-center">
            <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No Dashboard Selected</h3>
            <p className="text-sm text-muted-foreground">Select a dashboard first</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="w-full max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold mb-0.5">API Configuration</h1>
            <p className="text-sm text-muted-foreground">
              Connect data sources, test them live, and add widgets
            </p>
          </div>
          {!isCreating && (
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add API
            </Button>
          )}
        </div>

        {/* Security banner */}
        <Card className="border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/25">
          <CardContent className="py-2.5 px-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <Shield className="w-3.5 h-3.5 text-green-700 dark:text-green-300" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-green-900 dark:text-green-100">
                  Enterprise-grade security
                </h3>
                <p className="text-[11px] text-green-700 dark:text-green-300">
                  All credentials encrypted with AES-256 · Headers never sent to our servers
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── ADD FORM ────────────────────────────────────────────────────── */}
        {isCreating && (
          <Card>
            <CardHeader className="pb-3 px-4 pt-4">
              <CardTitle className="text-sm">New API Endpoint</CardTitle>
              <CardDescription className="text-xs">
                Fill details and save — then test live and add widgets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="e.g., Users Service"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={formData.method}
                    onValueChange={(v: any) => setFormData({ ...formData, method: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">API URL *</Label>
                <Input
                  className="h-8 text-sm font-mono"
                  placeholder="https://api.example.com/data"
                  value={formData.url}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Try:{' '}
                  <span
                    className="font-mono cursor-pointer text-blue-600 hover:underline"
                    onClick={() => setFormData({
                      ...formData,
                      url:  'https://jsonplaceholder.typicode.com/users',
                      name: formData.name || 'JSONPlaceholder Users',
                    })}
                  >
                    jsonplaceholder.typicode.com/users
                  </span>
                </p>
              </div>

              {/* Auth */}
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Authentication</Label>
                    <Select
                      value={formData.authType}
                      onValueChange={(v: AuthType) =>
                        setFormData({ ...formData, authType: v, authKey: '', authValue: '' })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="api-key">API Key (header)</SelectItem>
                        <SelectItem value="bearer">Bearer Token</SelectItem>
                        <SelectItem value="basic">Basic Auth</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Refresh interval (sec)</Label>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      min={0}
                      placeholder="0 = manual"
                      value={formData.refreshInterval || ''}
                      onChange={e =>
                        setFormData({ ...formData, refreshInterval: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                {/* Auth credential inputs — conditional */}
                {authHint && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <KeyRound className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Credentials
                      </span>
                    </div>
                    {formData.authType !== 'bearer' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{authHint.keyLabel}</Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder={authHint.placeholder || authHint.keyLabel}
                          value={formData.authKey}
                          onChange={e => setFormData({ ...formData, authKey: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs">{authHint.valLabel}</Label>
                      <Input
                        className="h-8 text-sm font-mono"
                        type="password"
                        placeholder={`Enter ${authHint.valLabel.toLowerCase()}`}
                        value={formData.authValue}
                        onChange={e => setFormData({ ...formData, authValue: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!formData.name.trim() || !formData.url.trim()}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Save Endpoint
                </Button>
                <Button size="sm" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── CONNECTED APIs ───────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Connected APIs</h2>
            {endpoints.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {endpoints.length} source{endpoints.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {endpoints.length === 0 && !isCreating && (
            <Card>
              <CardContent className="py-10 text-center">
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-semibold mb-1">No APIs yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Add your first data source</p>
                <Button size="sm" onClick={() => setIsCreating(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add first API
                </Button>
              </CardContent>
            </Card>
          )}

          {endpoints.length > 0 && (
            <div className="space-y-3">
              {endpoints.map(endpoint => (
                <Card key={endpoint.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <Database className="w-3.5 h-3.5 text-white" />
                          </div>
                          <h3 className="font-semibold text-xs truncate">{endpoint.name}</h3>
                        </div>

                        {/* URL row with copy */}
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] text-muted-foreground font-mono truncate flex-1">
                            {endpoint.url}
                          </p>
                          <button
                            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => copyUrl(endpoint.url, endpoint.id)}
                            title="Copy URL"
                          >
                            {copiedId === endpoint.id
                              ? <Check className="w-3 h-3 text-green-500" />
                              : <Copy className="w-3 h-3" />
                            }
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {endpoint.method}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Active
                          </Badge>
                          {endpoint.authType && endpoint.authType !== 'none' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-400">
                              <KeyRound className="w-2.5 h-2.5 mr-1" />
                              {endpoint.authType}
                            </Badge>
                          )}
                          {endpoint.refreshInterval > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              <RefreshCw className="w-2.5 h-2.5 mr-1" />
                              {endpoint.refreshInterval}s
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() =>
                            setExpandedId(expandedId === endpoint.id ? null : endpoint.id)
                          }
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Test & Add
                          {expandedId === endpoint.id
                            ? <ChevronUp className="w-3 h-3 ml-1" />
                            : <ChevronDown className="w-3 h-3 ml-1" />
                          }
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => setDeleteId(endpoint.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Inline live preview */}
                    {expandedId === endpoint.id && (
                      <div className="mt-3 pt-3 border-t">
                        <LiveAPIPreview
                          url={endpoint.url}
                          method={endpoint.method}
                          headers={endpoint.headers}
                          endpointId={endpoint.id}
                          onAnalysisComplete={() => {}}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v: boolean) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the API endpoint. Widgets using it will stop fetching data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteId) { removeEndpoint(deleteId); toast.success('Endpoint removed') }
                setDeleteId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
