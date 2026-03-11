'use client'

// src/components/builder/widget-config-dialog.tsx

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import type { ChartType } from '@/types/widget'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, LineChart, PieChart, AreaChart,
  Table2, Loader2, Gauge, TrendingUp, AlignLeft, Circle,
} from 'lucide-react'

interface WidgetConfigDialogProps {
  open:              boolean
  onOpenChange:      (open: boolean) => void
  endpointId?:       string
  suggestedType?:    ChartType
  suggestedXAxis?:   string
  suggestedYAxis?:   string
  availableFields?:  Array<{ name: string; type: string }>
}

// ── Fix #3 — typed icon map ───────────────────────────────────
const chartIcons: Record<ChartType, LucideIcon> = {
  line:             LineChart,
  bar:              BarChart3,
  pie:              PieChart,
  area:             AreaChart,
  donut:            Circle,
  'horizontal-bar': AlignLeft,
  'horizontal-stacked-bar': AlignLeft,
  'grouped-bar': BarChart3,
  'drilldown-bar': BarChart3,
  gauge:            Gauge,
  'ring-gauge':     Gauge,
  'status-card':    TrendingUp,
  table:            Table2,
}

const CHART_TYPE_ROWS: ChartType[][] = [
  ['bar', 'line', 'area', 'pie', 'donut', 'grouped-bar'],
  ['horizontal-bar', 'horizontal-stacked-bar', 'drilldown-bar'],
  ['gauge', 'ring-gauge', 'status-card', 'table'],
]

const chartTypeLabel: Record<ChartType, string> = {
  bar:              'Bar',
  line:             'Line',
  area:             'Area',
  pie:              'Pie',
  donut:            'Donut',
  'horizontal-bar': 'H-Bar',
  'horizontal-stacked-bar': 'Stacked H-Bar',
  'grouped-bar':    'Grouped',
  'drilldown-bar':  'Drilldown',
  gauge:            'Gauge',
  'ring-gauge':     'Ring',
  'status-card':    'KPI',
  table:            'Table',
}

export function WidgetConfigDialog({
  open,
  onOpenChange,
  endpointId,
  suggestedType,
  suggestedXAxis,
  suggestedYAxis,
  availableFields,
}: WidgetConfigDialogProps) {
  const { addWidget, endpoints } = useDashboardStore()

  const [title, setTitle]               = useState('')
  const [type, setType]                 = useState<ChartType>('bar')
  const [xAxis, setXAxis]               = useState('')
  const [yAxis, setYAxis]               = useState('')
  const [aliases, setAliases]           = useState<Record<string, string>>({})
  const [fields, setFields]             = useState<Array<{ name: string; type: string }>>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>(
    endpointId ?? endpoints[0]?.id ?? '',
  )

  const endpoint = endpoints.find(e => e.id === selectedEndpointId)

  // ── Fix #6 — useCallback so it's stable across renders ───────
  const fetchFields = useCallback(async (ep: { url: string; method: 'GET' | 'POST'; headers?: Record<string, string> }) => {
    setLoadingFields(true)
    setFields([])
    try {
      const res = await fetch(
        ep.url,
        buildEndpointRequestInit({
          method: ep.method,
          headers: ep.headers,
        }),
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result   = await res.json()
      const dataArray =
        DataAnalyzer.extractDataArray(result) ??
        (Array.isArray(result) ? result : [result])
      const analysis = DataAnalyzer.analyzeArray(dataArray)
      setFields(analysis.fields)
      if (!suggestedXAxis) setXAxis(analysis.fields[0]?.name ?? '')
      if (!suggestedYAxis) setYAxis(analysis.fields[1]?.name ?? analysis.fields[0]?.name ?? '')
    } catch (err) {
      // ── Fix #4 — log the actual error ────────────────────────
      console.warn('[WidgetConfigDialog] fetchFields failed:', err)
      toast.error('Could not fetch fields. Enter axis names manually.')
      setFields([])
    } finally {
      setLoadingFields(false)
    }
  }, [suggestedXAxis, suggestedYAxis])

  // ── Fix #2 — all prop deps listed, effect is intentionally
  //    init-only (fires when dialog opens). eslint-disable is
  //    explicit here rather than silently missing deps. ─────────
  useEffect(() => {
    if (!open) return

    const ep = endpointId
      ? endpoints.find(e => e.id === endpointId)
      : endpoints[0]

    setSelectedEndpointId(ep?.id ?? '')
    setTitle(ep?.name ?? '')
    setType(suggestedType ?? 'bar')
    setXAxis(suggestedXAxis ?? '')
    setYAxis(suggestedYAxis ?? '')
    setAliases({})

    if (availableFields?.length) {
      setFields(availableFields)
      setXAxis(suggestedXAxis ?? availableFields[0]?.name ?? '')
      setYAxis(suggestedYAxis ?? availableFields[1]?.name ?? availableFields[0]?.name ?? '')
    } else if (ep) {
      fetchFields(ep)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]) // ← intentional: init fires once on open, not on every prop change

  const handleEndpointChange = (id: string) => {
    const ep = endpoints.find(e => e.id === id)
    if (!ep) return
    setSelectedEndpointId(id)
    setTitle(ep.name)
    setXAxis('')
    setYAxis('')
    fetchFields(ep)
  }

  const handleCreate = () => {
    if (!endpoint) {
      toast.error('Please select an API endpoint first')
      return
    }
    if (!title.trim()) {
      toast.error('Please enter a widget title')
      return
    }
    if (!xAxis && !['gauge', 'status-card'].includes(type)) {
      toast.error('Please select or enter an X-axis field')
      return
    }

    addWidget({
      title:       title.trim(),
      type,
      endpointId:  endpoint.id,
      dataMapping: {
        xAxis: xAxis || fields[0]?.name || '',
        yAxis: yAxis || undefined,
        aliases: Object.keys(aliases).length > 0 ? aliases : undefined,
      },
    })

    toast.success('Widget added to dashboard')
    onOpenChange(false)
  }

  const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(type)

  const setAliasForField = (field: string, value: string) => {
    if (!field) return
    setAliases(prev => {
      const next = { ...prev }
      const trimmed = value.trim()
      if (!trimmed) {
        delete next[field]
      } else {
        next[field] = trimmed
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Create Widget</DialogTitle>
          <DialogDescription className="text-xs">
            Configure a new widget using data from{' '}
            <span className="font-mono font-medium">
              {endpoint?.name || 'a connected API'}
            </span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Widget title *</Label>
            <Input
              className="h-9 text-sm"
              placeholder="e.g., Revenue by Month"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Endpoint selector */}
          {!endpointId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Data source</Label>
              <Select value={selectedEndpointId} onValueChange={handleEndpointChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select API endpoint" />
                </SelectTrigger>
                <SelectContent>
                  {endpoints.map(ep => (
                    <SelectItem key={ep.id} value={ep.id}>{ep.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Chart type picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Chart type</Label>
            <div className="space-y-1.5">
              {CHART_TYPE_ROWS.map((row, ri) => (
                <div
                  key={ri}
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}
                >
                  {row.map(chartType => {
                    const Icon       = chartIcons[chartType]
                    const isSelected = type === chartType
                    return (
                      <button
                        key={chartType}
                        type="button"
                        onClick={() => setType(chartType)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-[10px] font-medium ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                          {chartTypeLabel[chartType]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* X axis */}
          {needsXAxis && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                X-axis (horizontal)
                {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
              {fields.length > 0 ? (
                <Select value={xAxis} onValueChange={setXAxis} disabled={loadingFields}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select field" /></SelectTrigger>
                  <SelectContent>
                    {fields.map(field => (
                      <SelectItem key={field.name} value={field.name}>
                        <div className="flex items-center gap-2">
                          <span>{field.name}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{field.type}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-9 text-sm font-mono"
                  placeholder={loadingFields ? 'Fetching fields...' : 'e.g., month'}
                  value={xAxis}
                  onChange={e => setXAxis(e.target.value)}
                  disabled={loadingFields}
                />
              )}
              {xAxis && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Field alias for X-axis</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder={`Rename "${xAxis}" (optional)`}
                    value={aliases[xAxis] ?? ''}
                    onChange={e => setAliasForField(xAxis, e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Y axis */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              {['gauge', 'status-card'].includes(type) ? 'Value field' : 'Y-axis (vertical)'}
              {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
            </Label>
            {fields.length > 0 ? (
              <Select value={yAxis} onValueChange={setYAxis} disabled={loadingFields}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select field" /></SelectTrigger>
                <SelectContent>
                  {fields.map(field => (
                    <SelectItem key={field.name} value={field.name}>
                      <div className="flex items-center gap-2">
                        <span>{field.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{field.type}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-9 text-sm font-mono"
                placeholder={loadingFields ? 'Fetching fields...' : 'e.g., revenue'}
                value={yAxis}
                onChange={e => setYAxis(e.target.value)}
                disabled={loadingFields}
              />
            )}
            {yAxis && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Field alias for Y-axis</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder={`Rename "${yAxis}" (optional)`}
                  value={aliases[yAxis] ?? ''}
                  onChange={e => setAliasForField(yAxis, e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Advanced aliases (optional)</Label>
            <Textarea
              className="min-h-[70px] text-xs font-mono"
              placeholder={'count(9): Meter Count\nconn_comm: Connected'}
              value={Object.entries(aliases).map(([k, v]) => `${k}: ${v}`).join('\n')}
              onChange={e => {
                const parsed: Record<string, string> = {}
                e.target.value
                  .split('\n')
                  .map(line => line.trim())
                  .filter(Boolean)
                  .forEach(line => {
                    const idx = line.indexOf(':')
                    if (idx <= 0) return
                    const key = line.slice(0, idx).trim()
                    const val = line.slice(idx + 1).trim()
                    if (key && val) parsed[key] = val
                  })
                setAliases(parsed)
              }}
            />
            <p className="text-[10px] text-muted-foreground">
              Format: <span className="font-mono">field_name: Display Label</span>
            </p>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={loadingFields}>
            {loadingFields
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Loading fields...</>
              : 'Create widget'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
