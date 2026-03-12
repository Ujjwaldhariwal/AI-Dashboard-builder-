'use client'

// src/app/(builder)/api-config/page.tsx

import { useState } from 'react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  ToggleLeft, ToggleRight,
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { LiveAPIPreview } from '@/components/builder/api-tester/live-api-preview'
import { toast } from 'sonner'

type AuthType   = 'none' | 'api-key' | 'bearer' | 'basic' | 'custom-headers'
type StatusType = 'active' | 'inactive'

const defaultForm = {
  name:            '',
  url:             '',
  method:          'GET' as 'GET' | 'POST',
  authType:        'none' as AuthType,
  authKey:         '',
  authValue:       '',
  customHeaders:   '',
  refreshInterval: 0,
  status:          'active' as StatusType,   // ✅ now actually used
}

const AUTH_HINTS: Record<AuthType, { keyLabel: string; valLabel: string; placeholder: string } | null> = {
  'none':    null,
  'api-key': { keyLabel: 'Header name', valLabel: 'API Key value', placeholder: 'X-API-Key' },
  'bearer':  { keyLabel: '', valLabel: 'Bearer token', placeholder: '' },
  'basic':   { keyLabel: 'Username', valLabel: 'Password', placeholder: '' },
  'custom-headers': null,
}

const BOSCH_UPPCL_PRESET: Array<{ name: string; path: string }> = [
  { name: 'Meter Installed', path: 'GetMeterInstalled' },
  { name: 'Communication Status Meter', path: 'GetCommunicationStatusMeter' },
  { name: 'Connection Status', path: 'GetConnectionStatus' },
  { name: 'Disconnection Aging', path: 'GetDisconnectionAging' },
  { name: 'Disconnection vs Reconnection', path: 'GetDisconnectionVsReconnection' },
  { name: 'Aging Wise Disconnected Consumer', path: 'getAgingWiseDisconnectedConsumer' },
  { name: 'Prepaid vs Postpaid Consumer', path: 'getPrepaidVsPostpaidConsumer' },
  { name: 'Date Wise Recharge Count and Value', path: 'getDateWiseRechargeCountAndValue' },
  { name: 'Monthly Recharge Received', path: 'getMonthlyRechargeRecieved' },
  { name: 'Circle Wise Consumer Negative Balance', path: 'getCircleWiseConsumerWithNegativeBalance' },
  { name: 'Negative Balance Wise Consumer Count', path: 'getNegativeBalanceWiseConsumerCount' },
  { name: 'Aging Wise Negative Balance', path: 'getAgingWiseNegativeBalanceConsumerCount' },
  { name: 'Net Metering Con', path: 'netMeteringCon' },
  { name: 'Power Factor', path: 'GetPF' },
  { name: 'Feeder Wise Consumer Count', path: 'getFeederWiseConsumerCount' },
  { name: 'Feeder Monthly Billing Top 10', path: 'getFeederWiseMonthlyBillingDataTop10' },
  { name: 'Feeder Monthly Billing Bottom 10', path: 'getFeederWiseMonthlyBillingDataBottom10' },
  { name: 'Feeder Monthly Billing', path: 'getFeederWiseMonthlyBillingData' },
  { name: 'Feeder Disconnected Top 10', path: 'getFeederWiseDisconnectedConsumerTop10' },
  { name: 'Feeder Disconnected Bottom 10', path: 'getFeederWiseDisconnectedConsumerBottom10' },
  { name: 'Feeder Disconnected Consumer', path: 'getFeederWiseDisconnectedConsumer' },
  { name: 'Feeder Non Communication Meter', path: 'getFeederWiseNonCommMeter' },
  { name: 'DTR Wise Consumer Count', path: 'getDTRWiseConsumerCount' },
  { name: 'Outage Count FDR', path: 'outageCountFDR' },
  { name: 'Outage Count DTR', path: 'outageCountDTR' },
  { name: 'Con Meter Current Month Count', path: 'ConMeter_CurrentMonthCount' },
  { name: 'Con Meter Daily Count', path: 'ConMeter_DailyCount' },
  { name: 'Con Meter Block Count Current', path: 'ConMeter_BlockCount_Current' },
  { name: 'Con Meter Count Trend', path: 'ConMeter_MeterCount' },
  { name: 'Con Meter Previous Daily Count', path: 'ConMeter_PrevousDailyCount' },
  { name: 'Con Meter Block Previous', path: 'ConMeter_BlockCount_Previous' },
  { name: 'Con Meter Total Count', path: 'ConMeter_TotalCount' },
  { name: 'Con Meter HHU Count', path: 'ConMeter_HHUCount' },
  { name: 'Con Meter Month Count', path: 'ConMeter_MonthCount' },
  { name: 'Con Meter Block Load Availability', path: 'ConMeter_BlockLoad_Availity' },
]

export default function APIConfigPage() {
  const {
    currentDashboardId, endpoints,
    addEndpoint, removeEndpoint, updateEndpoint,
  } = useDashboardStore()

  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData]     = useState(defaultForm)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [copiedId, setCopiedId]     = useState<string | null>(null)
  const dashboardEndpoints = endpoints.filter(
    endpoint => (endpoint.dashboardId ?? currentDashboardId) === currentDashboardId,
  )

  const resetForm = () => { setFormData(defaultForm); setIsCreating(false) }

  const buildHeaders = (form: typeof defaultForm): Record<string, string> => {
    if (form.authType === 'none') return {}
    if (form.authType === 'custom-headers') {
      return form.customHeaders
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .reduce((acc, line) => {
          const idx = line.indexOf(':')
          if (idx <= 0) return acc
          const key = line.slice(0, idx).trim()
          const value = line.slice(idx + 1).trim()
          if (key) acc[key] = value
          return acc
        }, {} as Record<string, string>)
    }
    if (!form.authValue) return {}
    if (form.authType === 'bearer')
      return { Authorization: `Bearer ${form.authValue}` }
    if (form.authType === 'api-key' && form.authKey)
      return { [form.authKey]: form.authValue }
    if (form.authType === 'basic')
      return { Authorization: `Basic ${btoa(`${form.authKey}:${form.authValue}`)}` }
    return {}
  }

  const loadBoschPreset = () => {
    const existingUrls = new Set(dashboardEndpoints.map(e => e.url))
    let added = 0

    BOSCH_UPPCL_PRESET.forEach(item => {
      const url = `/api/bosch/${item.path}`
      if (existingUrls.has(url)) return

      addEndpoint({
        name: item.name,
        url,
        method: 'POST',
        authType: 'none',
        refreshInterval: 30,
        status: 'active',
        headers: {},
      })
      added += 1
    })

    if (added === 0) {
      toast.info('Bosch preset already loaded')
      return
    }
    toast.success(`Loaded Bosch UPPCL preset (${added} new endpoints)`)
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
      status:          formData.status,        // ✅ was hardcoded 'active'
      headers:         buildHeaders(formData),
    })
    toast.success('API endpoint saved')
    resetForm()
  }

  // ✅ Toggle active/inactive on existing endpoint
  const toggleStatus = (id: string, current: StatusType) => {
    const next = current === 'active' ? 'inactive' : 'active'
    updateEndpoint(id, { status: next })
    toast.success(`Endpoint set to ${next}`)
  }

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url).catch(() => {
      toast.error('Failed to copy URL')
    })
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadBoschPreset}>
              <Database className="w-3.5 h-3.5 mr-1.5" />
              Load UPPCL MDM Preset
            </Button>
            {!isCreating && (
              <Button size="sm" onClick={() => setIsCreating(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add API
              </Button>
            )}
          </div>
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

        {/* ── ADD FORM ─────────────────────────────────────────── */}
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
                    onValueChange={(v: 'GET' | 'POST') => setFormData({ ...formData, method: v })}
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

              {/* Auth + Status row */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Authentication</Label>
                  <Select
                    value={formData.authType}
                    onValueChange={(v: AuthType) =>
                      setFormData({
                        ...formData,
                        authType: v,
                        authKey: '',
                        authValue: '',
                        customHeaders: '',
                      })
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
                      <SelectItem value="custom-headers">Custom Headers</SelectItem>
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
                {/* ✅ Status field — was missing entirely */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v: StatusType) => setFormData({ ...formData, status: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Auth credential inputs */}
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

              {formData.authType === 'custom-headers' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <KeyRound className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Custom Header Map
                    </span>
                  </div>
                  <Label className="text-xs">One header per line</Label>
                  <Textarea
                    className="text-xs font-mono min-h-[92px]"
                    placeholder={'userid: asxxp12\npassword: 212@121'}
                    value={formData.customHeaders}
                    onChange={e => setFormData({ ...formData, customHeaders: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Format: <span className="font-mono">Header-Name: value</span>
                  </p>
                </div>
              )}

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

        {/* ── CONNECTED APIs ────────────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Connected APIs</h2>
            {dashboardEndpoints.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {dashboardEndpoints.length} source{dashboardEndpoints.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {dashboardEndpoints.length === 0 && !isCreating && (
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

          {dashboardEndpoints.length > 0 && (
            <div className="space-y-3">
              {dashboardEndpoints.map(endpoint => {
                const isActive = endpoint.status === 'active'
                return (
                  <Card key={endpoint.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${
                              isActive ? 'from-blue-600 to-purple-600' : 'from-slate-400 to-slate-500'
                            }`}>
                              <Database className="w-3.5 h-3.5 text-white" />
                            </div>
                            <h3 className="font-semibold text-xs truncate">{endpoint.name}</h3>
                          </div>

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
                            {/* ✅ Dynamic status badge — was hardcoded "Active" */}
                            <Badge
                              variant={isActive ? 'default' : 'secondary'}
                              className={`text-[10px] px-1.5 py-0 ${
                                isActive
                                  ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {isActive ? 'Active' : 'Inactive'}
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
                          {/* ✅ Status toggle button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 text-xs px-2 ${
                              isActive
                                ? 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                            onClick={() => toggleStatus(endpoint.id, endpoint.status as StatusType)}
                            title={isActive ? 'Deactivate' : 'Activate'}
                          >
                            {isActive
                              ? <ToggleRight className="w-4 h-4 mr-1" />
                              : <ToggleLeft  className="w-4 h-4 mr-1" />
                            }
                            {isActive ? 'On' : 'Off'}
                          </Button>
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
                )
              })}
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
