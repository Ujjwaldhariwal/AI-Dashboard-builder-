'use client'

// src/components/builder/widget-edit-dialog.tsx

import { useState, useEffect } from 'react'
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
import { Widget, ChartType } from '@/types/widget'
import { toast } from 'sonner'
import {
  BarChart3, LineChart, PieChart, AreaChart,
  Table2, Loader2, Gauge, TrendingUp,
  AlignLeft, Circle,
} from 'lucide-react'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'

interface WidgetEditDialogProps {
  widget: Widget
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ✅ All 9 types — matches ChartType exactly
const chartIcons: Record<ChartType, any> = {
  bar:             BarChart3,
  line:            LineChart,
  area:            AreaChart,
  pie:             PieChart,
  donut:           Circle,
  'horizontal-bar': AlignLeft,
  'horizontal-stacked-bar': AlignLeft,
  'grouped-bar': BarChart3,
  'drilldown-bar': BarChart3,
  gauge:           Gauge,
  'ring-gauge':    Gauge,
  'status-card':   TrendingUp,
  table:           Table2,
}

const chartTypeLabel: Record<ChartType, string> = {
  bar:             'Bar',
  line:            'Line',
  area:            'Area',
  pie:             'Pie',
  donut:           'Donut',
  'horizontal-bar': 'H-Bar',
  'horizontal-stacked-bar': 'Stacked H-Bar',
  'grouped-bar':   'Grouped',
  'drilldown-bar': 'Drilldown',
  gauge:           'Gauge',
  'ring-gauge':    'Ring',
  'status-card':   'KPI',
  table:           'Table',
}

// 2-row layout matching widget-config-dialog
const CHART_TYPE_ROWS: ChartType[][] = [
  ['bar', 'line', 'area', 'pie', 'donut', 'grouped-bar'],
  ['horizontal-bar', 'horizontal-stacked-bar', 'drilldown-bar'],
  ['gauge', 'ring-gauge', 'status-card', 'table'],
]

export function WidgetEditDialog({ widget, open, onOpenChange }: WidgetEditDialogProps) {
  const { updateWidget, endpoints } = useDashboardStore()

  const [title, setTitle]               = useState(widget.title)
  const [type, setType]                 = useState<ChartType>(widget.type)
  const [xAxis, setXAxis]               = useState(widget.dataMapping.xAxis)
  const [yAxis, setYAxis]               = useState(widget.dataMapping.yAxis ?? '')
  const [aliases, setAliases]           = useState<Record<string, string>>(widget.dataMapping.aliases ?? {})
  const [fields, setFields]             = useState<Array<{ name: string; type: string }>>([])
  const [loadingFields, setLoadingFields] = useState(false)

  const endpoint = endpoints.find(e => e.id === widget.endpointId)

  // ── Reset on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setTitle(widget.title)
    setType(widget.type)
    setXAxis(widget.dataMapping.xAxis)
    setYAxis(widget.dataMapping.yAxis ?? '')
    setAliases(widget.dataMapping.aliases ?? {})
    fetchFields()
  }, [open])

  // ── Fetch fields from endpoint ─────────────────────────────────────────
  const fetchFields = async () => {
    if (!endpoint) return
    setLoadingFields(true)
    try {
      const res = await fetch(
        endpoint.url,
        buildEndpointRequestInit({
          method: endpoint.method,
          headers: endpoint.headers,
          body: endpoint.body,
        }),
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()

      const dataArray =
        DataAnalyzer.extractDataArray(result) ??
        (Array.isArray(result) ? result : [result])

      const analysis = DataAnalyzer.analyzeArray(dataArray)
      setFields(analysis.fields)
    } catch {
      // Fallback: show existing axes so user can still switch
      setFields([
        { name: widget.dataMapping.xAxis, type: 'string' },
        ...(widget.dataMapping.yAxis
          ? [{ name: widget.dataMapping.yAxis, type: 'number' }]
          : []),
      ])
    } finally {
      setLoadingFields(false)
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    updateWidget(widget.id, {
      title: title.trim(),
      type,
      dataMapping: {
        ...widget.dataMapping, // ✅ preserve yAxes multi-metric config
        xAxis,
        yAxis: yAxis || undefined,
        aliases: Object.keys(aliases).length > 0 ? aliases : undefined,
      },
    })

    toast.success('Widget updated')
    onOpenChange(false)
  }

  // Gauge + status-card only need Y field
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
          <DialogTitle className="text-lg">Edit Widget</DialogTitle>
          <DialogDescription className="text-xs">
            Update configuration for{' '}
            <span className="font-mono font-medium">{widget.title}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Widget Title *</Label>
            <Input
              className="h-9 text-sm"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Chart type picker — 2 rows, all 9 types */}
          <div className="space-y-1.5">
            <Label className="text-xs">Chart Type</Label>
            <div className="space-y-1.5">
              {CHART_TYPE_ROWS.map((row, ri) => (
                <div
                  key={ri}
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}
                >
                  {row.map(chartType => {
                    const Icon = chartIcons[chartType]
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
                        <Icon
                          className={`w-4 h-4 ${
                            isSelected ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        />
                        <span
                          className={`text-[10px] font-medium ${
                            isSelected ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        >
                          {chartTypeLabel[chartType]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Axes — side by side or single for gauge/kpi */}
          <div className={`grid gap-3 ${needsXAxis ? 'grid-cols-2' : 'grid-cols-1'}`}>

            {/* X axis */}
            {needsXAxis && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  X-Axis
                  {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
                </Label>
                {fields.length > 0 ? (
                  <Select value={xAxis} onValueChange={setXAxis} disabled={loadingFields}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map(f => (
                        <SelectItem key={f.name} value={f.name}>
                          <div className="flex items-center gap-2">
                            <span>{f.name}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {f.type}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-9 text-sm font-mono"
                    placeholder={loadingFields ? 'Fetching...' : 'e.g., month'}
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
              <Label className="text-xs flex items-center gap-1">
                {['gauge', 'ring-gauge', 'status-card'].includes(type) ? 'Value field' : 'Y-Axis'}
                {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
              {fields.length > 0 ? (
                <Select value={yAxis} onValueChange={setYAxis} disabled={loadingFields}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map(f => (
                      <SelectItem key={f.name} value={f.name}>
                        <div className="flex items-center gap-2">
                          <span>{f.name}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {f.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-9 text-sm font-mono"
                  placeholder={loadingFields ? 'Fetching...' : 'e.g., revenue'}
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

          {/* Endpoint info */}
          <div className="p-2.5 rounded-lg bg-muted/50 border">
            <p className="text-[11px] text-muted-foreground">
              Data source:{' '}
              <span className="font-medium text-foreground">
                {endpoint?.name ?? 'Unknown'}
              </span>
              {' · '}
              <span className="font-mono text-[10px] truncate">
                {endpoint?.url}
              </span>
            </p>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loadingFields}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
