'use client'

import { useState, useEffect } from 'react'
import { useDashboardStore } from '@/store/builder-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Trash2, Globe, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle2, XCircle, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { LiveAPIPreview } from '@/components/builder/api-tester/live-api-preview'
import { cn } from '@/lib/utils'

// ── Local type (APIEndpoint not exported from store) ─────────────────────────
type APIEndpoint = {
  id: string
  name: string
  url: string
  method: 'GET' | 'POST'
  authType: 'none' | 'api-key' | 'bearer' | 'basic'
  headers?: Record<string, string>
  refreshInterval: number
  status: 'active' | 'inactive'
}

type HealthStatus = 'idle' | 'checking' | 'ok' | 'error'

export default function APIConfigPage() {
  const { endpoints, addEndpoint, removeEndpoint, updateEndpoint } = useDashboardStore()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [authType, setAuthType] = useState<'none' | 'api-key' | 'bearer' | 'basic'>('none')

  // ── UI state ────────────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [healthMap, setHealthMap] = useState<Record<string, HealthStatus>>({})

  // ── Feature 8: health ping ───────────────────────────────────────────────
  const pingEndpoint = async (ep: APIEndpoint) => {
    setHealthMap(prev => ({ ...prev, [ep.id]: 'checking' }))
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        signal: AbortSignal.timeout(5000),
      })
      setHealthMap(prev => ({ ...prev, [ep.id]: res.ok ? 'ok' : 'error' }))
    } catch {
      setHealthMap(prev => ({ ...prev, [ep.id]: 'error' }))
    }
  }

  const pingAll = () => endpoints.forEach(pingEndpoint)

  useEffect(() => {
    if (endpoints.length) pingAll()
  }, [endpoints.length])

  // ── Add endpoint ────────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!url.trim()) { toast.error('URL is required'); return }
    try { new URL(url.trim()) } catch { toast.error('Invalid URL'); return }

    addEndpoint({
      name: name.trim(),
      url: url.trim(),
      method,
      authType,
      refreshInterval: 30,
      status: 'active',
    })

    toast.success('Endpoint saved')
    setName('')
    setUrl('')
    setMethod('GET')
    setAuthType('none')
  }

  // ── Health dot ──────────────────────────────────────────────────────────────
  const HealthDot = ({ id }: { id: string }) => {
    const s = healthMap[id] ?? 'idle'
    return (
      <span
        title={s}
        className={cn(
          'inline-block w-2.5 h-2.5 rounded-full flex-shrink-0',
          s === 'checking' && 'bg-yellow-400 animate-pulse',
          s === 'ok'       && 'bg-green-500',
          s === 'error'    && 'bg-red-500',
          s === 'idle'     && 'bg-muted-foreground/30',
        )}
      />
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">

      {/* ── Page header ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Configuration</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Connect data sources and test them live
          </p>
        </div>
        {endpoints.length > 0 && (
          <Button variant="outline" size="sm" onClick={pingAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Ping All
          </Button>
        )}
      </div>

      {/* ── Add endpoint form ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add New Endpoint
          </CardTitle>
          <CardDescription>
            Save a REST API endpoint to use as a data source for your widgets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Users API"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL *</Label>
              <Input
                placeholder="https://api.example.com/data"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v: 'GET' | 'POST') => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Auth Type</Label>
              <Select value={authType} onValueChange={(v: any) => setAuthType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Auth</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="api-key">API Key</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              Save Endpoint
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Saved endpoints list ───────────────────────── */}
      {endpoints.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Saved Endpoints ({endpoints.length})
            </h2>
          </div>

          {endpoints.map(ep => {
            const isExpanded = expandedId === ep.id
            const health = healthMap[ep.id] ?? 'idle'

            return (
              <Card key={ep.id} className="overflow-hidden">
                {/* Endpoint row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Health dot */}
                  <HealthDot id={ep.id} />

                  {/* Icon */}
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-4 h-4 text-white" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{ep.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 font-mono">
                        {ep.method}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] px-1.5',
                          health === 'ok'    && 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
                          health === 'error' && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
                        )}
                      >
                        {health === 'checking' ? 'checking…' : health === 'ok' ? 'online' : health === 'error' ? 'unreachable' : 'not pinged'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                      {ep.url}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => pingEndpoint(ep)}
                      title="Ping"
                    >
                      {health === 'checking'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : health === 'ok'
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          : health === 'error'
                            ? <XCircle className="w-3.5 h-3.5 text-red-500" />
                            : <RefreshCw className="w-3.5 h-3.5" />
                      }
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setExpandedId(isExpanded ? null : ep.id)}
                    >
                      Test & Analyze
                      {isExpanded
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                      }
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      onClick={() => {
                        if (confirm(`Delete "${ep.name}"?`)) {
                          removeEndpoint(ep.id)
                          toast.success('Endpoint removed')
                          if (expandedId === ep.id) setExpandedId(null)
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

{isExpanded && (
  <div className="border-t bg-muted/20 px-4 py-4">
    <LiveAPIPreview 
      endpointId={ep.id} 
      url={ep.url} 
      method={ep.method} 
    /> 
  </div>
)}


              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No endpoints yet</h2>
            <p className="text-muted-foreground text-sm">
              Add your first REST API endpoint above to start building widgets.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
