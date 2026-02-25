'use client'

import { useState } from 'react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Database, Trash2, CheckCircle2,
  Shield, ChevronDown, ChevronUp, Zap,
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { LiveAPIPreview } from '@/components/builder/api-tester/live-api-preview'
import { toast } from 'sonner'

type AuthType = 'none' | 'api-key' | 'bearer' | 'basic'

const defaultForm = {
  name: '',
  url: '',
  method: 'GET' as 'GET' | 'POST',
  authType: 'none' as AuthType,
  refreshInterval: 0,
  status: 'active' as const,
}

export default function APIConfigPage() {
  const {
    currentDashboardId,
    endpoints,
    addEndpoint,
    removeEndpoint,
  } = useDashboardStore()

  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState(defaultForm)
  // Track which endpoint's live preview is expanded
  const [expandedEndpointId, setExpandedEndpointId] = useState<string | null>(null)

  const resetForm = () => {
    setFormData(defaultForm)
    setIsCreating(false)
  }

  if (!currentDashboardId) {
    return (
      <div className="p-6">
        <div className="w-full max-w-lg mx-auto">
          <Card>
            <CardContent className="py-10 text-center">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-1">No Dashboard Selected</h3>
              <p className="text-sm text-muted-foreground">
                Please select a dashboard first
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error('Name and URL are required')
      return
    }
    addEndpoint({ ...formData })
    toast.success('✅ API endpoint saved')
    resetForm()
  }

  return (
    <div className="p-6">
      <div className="w-full max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold mb-0.5">API Configuration</h1>
            <p className="text-sm text-muted-foreground">
              Connect data sources, test them, and create widgets
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
                  All credentials encrypted with AES-256
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── ADD FORM ──────────────────────────────────────── */}
        {isCreating && (
          <Card>
            <CardHeader className="pb-3 px-4 pt-4">
              <CardTitle className="text-sm">New API Endpoint</CardTitle>
              <CardDescription className="text-xs">
                Fill details and save — then test & add widgets
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
                    onChange={e =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={formData.method}
                    onValueChange={(v: any) =>
                      setFormData({ ...formData, method: v })
                    }
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
                  className="h-8 text-sm"
                  placeholder="https://api.example.com/data"
                  value={formData.url}
                  onChange={e =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Try:{' '}
                  <span
                    className="font-mono cursor-pointer text-blue-600 hover:underline"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        url: 'https://jsonplaceholder.typicode.com/users',
                        name: formData.name || 'JSONPlaceholder Users',
                      })
                    }
                  >
                    jsonplaceholder.typicode.com/users
                  </span>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Auth</Label>
                  <Select
                    value={formData.authType}
                    onValueChange={(v: AuthType) =>
                      setFormData({ ...formData, authType: v })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="api-key">API Key</SelectItem>
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
                      setFormData({
                        ...formData,
                        refreshInterval: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {/* ✅ Save is always enabled — no longer requires analysis */}
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

        {/* ── CONNECTED APIs ────────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Connected APIs
            </h2>
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
                <p className="text-sm text-muted-foreground mb-4">
                  Add your first data source
                </p>
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
                <Card
                  key={endpoint.id}
                  className="hover:shadow-sm transition-shadow"
                >
                  <CardContent className="p-3">
                    {/* Endpoint row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <Database className="w-3.5 h-3.5 text-white" />
                          </div>
                          <h3 className="font-semibold text-xs truncate">
                            {endpoint.name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {endpoint.url}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {endpoint.method}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            Active
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Test & Add Widgets toggle */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() =>
                            setExpandedEndpointId(
                              expandedEndpointId === endpoint.id
                                ? null
                                : endpoint.id,
                            )
                          }
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Test & Add
                          {expandedEndpointId === endpoint.id ? (
                            <ChevronUp className="w-3 h-3 ml-1" />
                          ) : (
                            <ChevronDown className="w-3 h-3 ml-1" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500"
                          onClick={() => {
                            if (confirm('Delete this endpoint?')) {
                              removeEndpoint(endpoint.id)
                              toast.success('Endpoint removed')
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* ✅ Inline live preview AFTER endpoint is saved */}
                    {expandedEndpointId === endpoint.id && (
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
    </div>
  )
}
