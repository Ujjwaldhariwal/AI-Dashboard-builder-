'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Database, Trash2, CheckCircle2, Shield } from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { LiveAPIPreview } from '@/components/builder/api-tester/live-api-preview'
import { toast } from 'sonner'
import { DataAnalysis } from '@/lib/ai/data-analyzer'

type AuthType = 'none' | 'api-key' | 'bearer' | 'basic'

export default function APIConfigPage() {
  const { currentDashboardId, endpoints, addEndpoint, removeEndpoint } = useDashboardStore()
  const [isCreating, setIsCreating] = useState(false)
  const [analysis, setAnalysis] = useState<DataAnalysis | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    method: 'GET' as 'GET' | 'POST',
    authType: 'none' as AuthType,
    refreshInterval: 0,
    status: 'active' as const,
  })

  const resetForm = () => {
    setFormData({ name: '', url: '', method: 'GET', authType: 'none', refreshInterval: 0, status: 'active' })
    setIsCreating(false)
    setAnalysis(null)
  }

  if (!currentDashboardId) {
    return (
      <div className="p-6">
        <div className="w-full max-w-lg mx-auto">
          <Card>
            <CardContent className="py-10 text-center">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-1">No Dashboard Selected</h3>
              <p className="text-sm text-muted-foreground">Please select a dashboard first</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const handleSubmit = () => {
    if (!formData.name || !formData.url) {
      toast.error('Name and URL are required')
      return
    }
    addEndpoint(formData)
    toast.success('✅ API endpoint added')
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
              Connect and test data sources with AI analysis
            </p>
          </div>
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add API
          </Button>
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

        {/* Add form */}
        {isCreating && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            {/* Left: form */}
            <Card className="h-fit">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-sm">Add API Endpoint</CardTitle>
                <CardDescription className="text-xs">Define connection and test response</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="e.g., Users Service"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Method</Label>
                    <Select
                      value={formData.method}
                      onValueChange={(v: any) => setFormData({ ...formData, method: v })}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Auth</Label>
                    <Select
                      value={formData.authType}
                      onValueChange={(v: AuthType) => setFormData({ ...formData, authType: v })}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="api-key">API Key</SelectItem>
                        <SelectItem value="bearer">Bearer Token</SelectItem>
                        <SelectItem value="basic">Basic Auth</SelectItem>
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
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Try: <span className="font-mono">https://jsonplaceholder.typicode.com/users</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Refresh interval (seconds)</Label>
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    min={0}
                    placeholder="0 = no refresh"
                    value={formData.refreshInterval || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, refreshInterval: Number(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSubmit} disabled={!analysis}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right: AI panel */}
            <Card className="h-fit border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm">AI Analysis</CardTitle>
                <CardDescription className="text-xs">
                  Test endpoint for AI-powered recommendations
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <LiveAPIPreview
                  url={formData.url}
                  method={formData.method}
                  onAnalysisComplete={(a) => setAnalysis(a)}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Connected APIs */}
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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {endpoints.map((endpoint) => (
                <Card key={endpoint.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <Database className="w-3.5 h-3.5 text-white" />
                          </div>
                          <h3 className="font-semibold text-xs truncate">{endpoint.name}</h3>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{endpoint.url}</p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {endpoint.method}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Active
                          </Badge>
                        </div>
                      </div>
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