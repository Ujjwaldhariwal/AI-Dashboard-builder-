'use client'

// src/components/builder/widget-edit-dialog.tsx

import { useState, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
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
import type {
  Widget,
  ChartType,
  TransformOp,
  TransformMathOperator,
  TransformFilterOperator,
} from '@/types/widget'
import { toast } from 'sonner'
import {
  BarChart3, LineChart, PieChart, AreaChart,
  Table2, Loader2, Gauge, TrendingUp,
  AlignLeft, Circle, Wand2, ChevronDown, ChevronUp,
  Plus, Trash2, ArrowUp, ArrowDown,
} from 'lucide-react'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import { saveEndpointMappingFeedback } from '@/lib/training/profile-client'

interface WidgetEditDialogProps {
  widget: Widget
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ✅ All 9 types — matches ChartType exactly
const chartIcons: Record<ChartType, LucideIcon> = {
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

type TransformType = TransformOp['type']

const TRANSFORM_TYPE_LABELS: Record<TransformType, string> = {
  parse_number: 'Parse Number (strip units)',
  concat: 'Combine Fields',
  rename: 'Rename Field',
  math: 'Math Operation',
  percent_of_total: '% of Total',
  filter_rows: 'Filter Rows',
  sort: 'Sort By',
  limit: 'Limit Rows',
}

const TRANSFORM_TYPE_ORDER: TransformType[] = [
  'parse_number',
  'concat',
  'rename',
  'math',
  'percent_of_total',
  'filter_rows',
  'sort',
  'limit',
]

const MATH_OPERATOR_LABELS: Record<TransformMathOperator, string> = {
  '+': '+',
  '-': '-',
  '*': '×',
  '/': '÷',
}

const FILTER_OPERATORS: TransformFilterOperator[] = ['>', '<', '=', '!=', '>=', '<=']

const SORT_ORDERS = [
  { value: 'asc' as const, label: 'Ascending' },
  { value: 'desc' as const, label: 'Descending' },
]

const createDefaultTransform = (type: TransformType): TransformOp => {
  switch (type) {
    case 'parse_number':
      return { type: 'parse_number', field: '' }
    case 'concat':
      return { type: 'concat', fields: [], separator: ' ', outputField: '' }
    case 'rename':
      return { type: 'rename', from: '', to: '' }
    case 'math':
      return { type: 'math', field: '', operator: '/', value: 1000, outputField: '' }
    case 'percent_of_total':
      return { type: 'percent_of_total', field: '', outputField: '' }
    case 'filter_rows':
      return { type: 'filter_rows', field: '', operator: '!=', value: '' }
    case 'sort':
      return { type: 'sort', field: '', order: 'asc' }
    case 'limit':
      return { type: 'limit', count: 10 }
    default:
      return { type: 'parse_number', field: '' }
  }
}

export function WidgetEditDialog({ widget, open, onOpenChange }: WidgetEditDialogProps) {
  const { updateWidget, endpoints } = useDashboardStore()

  const [title, setTitle]               = useState(widget.title)
  const [type, setType]                 = useState<ChartType>(widget.type)
  const [xAxis, setXAxis]               = useState(widget.dataMapping.xAxis)
  const [yAxis, setYAxis]               = useState(widget.dataMapping.yAxis ?? '')
  const [aliases, setAliases]           = useState<Record<string, string>>(widget.dataMapping.aliases ?? {})
  const [fields, setFields]             = useState<Array<{ name: string; type: string }>>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [transforms, setTransforms] = useState<TransformOp[]>(widget.dataMapping.transforms ?? [])
  const [transformsOpen, setTransformsOpen] = useState(
    (widget.dataMapping.transforms?.length ?? 0) > 0,
  )

  const endpoint = endpoints.find(e => e.id === widget.endpointId)

  // ── Reset on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setTitle(widget.title)
    setType(widget.type)
    setXAxis(widget.dataMapping.xAxis)
    setYAxis(widget.dataMapping.yAxis ?? '')
    setAliases(widget.dataMapping.aliases ?? {})
    const existingTransforms = widget.dataMapping.transforms ?? []
    setTransforms(existingTransforms)
    setTransformsOpen(existingTransforms.length > 0)
    void fetchFields()
  }, [open, widget])

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
        transforms: transforms.length > 0 ? transforms : undefined,
      },
    })

    void saveEndpointMappingFeedback({
      dashboardId: widget.dashboardId,
      endpointId: widget.endpointId,
      widgetId: widget.id,
      sourceAction: 'edit_widget',
      acceptedMapping: {
        type,
        xAxis,
        yAxis: yAxis || undefined,
        yAxes: widget.dataMapping.yAxes,
        reason: 'Manual widget edit action',
        confidence: 92,
        source: 'manual',
      },
      previousMapping: {
        type: widget.type,
        xAxis: widget.dataMapping.xAxis,
        yAxis: widget.dataMapping.yAxis,
        yAxes: widget.dataMapping.yAxes,
        reason: 'Previous widget mapping',
        confidence: 70,
        source: 'manual',
      },
    }).catch(() => {
      // non-blocking feedback write
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

  const addTransform = () => {
    setTransformsOpen(true)
    setTransforms(prev => [...prev, createDefaultTransform('parse_number')])
  }

  const removeTransform = (index: number) => {
    setTransforms(prev => prev.filter((_, idx) => idx !== index))
  }

  const moveTransform = (index: number, direction: 'up' | 'down') => {
    setTransforms(prev => {
      const next = [...prev]
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      if (swapIndex < 0 || swapIndex >= next.length) return prev
      ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
      return next
    })
  }

  const setTransformType = (index: number, nextType: TransformType) => {
    setTransforms(prev => prev.map((op, idx) => (
      idx === index ? createDefaultTransform(nextType) : op
    )))
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

          <div className="space-y-2 rounded-lg border p-3">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2"
              onClick={() => setTransformsOpen(prev => !prev)}
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                <Wand2 className="w-3.5 h-3.5" />
                Transform Data
                {transforms.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {transforms.length}
                  </Badge>
                )}
              </span>
              {transformsOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {transformsOpen && (
              <div className="space-y-2 pt-1">
                {transforms.length === 0 && (
                  <div className="rounded-md border border-dashed px-3 py-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      No transforms — data passes through as-is
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={addTransform}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add Transform
                    </Button>
                  </div>
                )}

                {transforms.map((transform, index) => (
                  <div key={`${transform.type}-${index}`} className="rounded-md border p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Select
                          value={transform.type}
                          onValueChange={(value: TransformType) => setTransformType(index, value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Operation" />
                          </SelectTrigger>
                          <SelectContent>
                            {TRANSFORM_TYPE_ORDER.map(opType => (
                              <SelectItem key={opType} value={opType}>
                                {TRANSFORM_TYPE_LABELS[opType]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveTransform(index, 'up')}
                          disabled={index === 0}
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveTransform(index, 'down')}
                          disabled={index === transforms.length - 1}
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          onClick={() => removeTransform(index)}
                          title="Remove transform"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {transform.type === 'parse_number' && (
                      <div className="space-y-1">
                        <Label className="text-[11px]">Field</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="e.g. power"
                          value={transform.field}
                          onChange={e => {
                            const field = e.target.value
                            setTransforms(prev => prev.map((op, idx) => (
                              idx === index && op.type === 'parse_number'
                                ? { ...op, field }
                                : op
                            )))
                          }}
                        />
                      </div>
                    )}

                    {transform.type === 'concat' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-[11px]">Fields (comma separated)</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="city, state"
                            value={transform.fields.join(', ')}
                            onChange={e => {
                              const fieldsValue = e.target.value
                                .split(',')
                                .map(part => part.trim())
                                .filter(Boolean)
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'concat'
                                  ? { ...op, fields: fieldsValue }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Separator</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder=" - "
                            value={transform.separator}
                            onChange={e => {
                              const separator = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'concat'
                                  ? { ...op, separator }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-3">
                          <Label className="text-[11px]">Output field</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="city_state"
                            value={transform.outputField}
                            onChange={e => {
                              const outputField = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'concat'
                                  ? { ...op, outputField }
                                  : op
                              )))
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {transform.type === 'rename' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[11px]">From</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="old_field"
                            value={transform.from}
                            onChange={e => {
                              const from = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'rename'
                                  ? { ...op, from }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">To</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="new_field"
                            value={transform.to}
                            onChange={e => {
                              const to = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'rename'
                                  ? { ...op, to }
                                  : op
                              )))
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {transform.type === 'math' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-[11px]">Field</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="watts"
                            value={transform.field}
                            onChange={e => {
                              const field = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'math'
                                  ? { ...op, field }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Operator</Label>
                          <Select
                            value={transform.operator}
                            onValueChange={(operator: TransformMathOperator) => {
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'math'
                                  ? { ...op, operator }
                                  : op
                              )))
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(MATH_OPERATOR_LABELS) as TransformMathOperator[]).map(op => (
                                <SelectItem key={op} value={op}>
                                  {MATH_OPERATOR_LABELS[op]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Value</Label>
                          <Input
                            className="h-8 text-xs"
                            type="number"
                            value={transform.value}
                            onChange={e => {
                              const value = Number(e.target.value)
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'math'
                                  ? { ...op, value: Number.isFinite(value) ? value : 0 }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-4">
                          <Label className="text-[11px]">Output field</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="kilowatts"
                            value={transform.outputField}
                            onChange={e => {
                              const outputField = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'math'
                                  ? { ...op, outputField }
                                  : op
                              )))
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {transform.type === 'percent_of_total' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Field</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="revenue"
                            value={transform.field}
                            onChange={e => {
                              const field = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'percent_of_total'
                                  ? { ...op, field }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Output field</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="revenue_pct"
                            value={transform.outputField}
                            onChange={e => {
                              const outputField = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'percent_of_total'
                                  ? { ...op, outputField }
                                  : op
                              )))
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {transform.type === 'filter_rows' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Field</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="latency"
                            value={transform.field}
                            onChange={e => {
                              const field = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'filter_rows'
                                  ? { ...op, field }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Operator</Label>
                          <Select
                            value={transform.operator}
                            onValueChange={(operator: TransformFilterOperator) => {
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'filter_rows'
                                  ? { ...op, operator }
                                  : op
                              )))
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FILTER_OPERATORS.map(operator => (
                                <SelectItem key={operator} value={operator}>
                                  {operator}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Value</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="0"
                            value={String(transform.value ?? '')}
                            onChange={e => {
                              const value = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'filter_rows'
                                  ? { ...op, value }
                                  : op
                              )))
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {transform.type === 'sort' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Field</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="timestamp"
                            value={transform.field}
                            onChange={e => {
                              const field = e.target.value
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'sort'
                                  ? { ...op, field }
                                  : op
                              )))
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Order</Label>
                          <Select
                            value={transform.order}
                            onValueChange={(order: 'asc' | 'desc') => {
                              setTransforms(prev => prev.map((op, idx) => (
                                idx === index && op.type === 'sort'
                                  ? { ...op, order }
                                  : op
                              )))
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SORT_ORDERS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {transform.type === 'limit' && (
                      <div className="space-y-1">
                        <Label className="text-[11px]">Count</Label>
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          min={1}
                          value={transform.count}
                          onChange={e => {
                            const count = Number(e.target.value)
                            setTransforms(prev => prev.map((op, idx) => (
                              idx === index && op.type === 'limit'
                                ? { ...op, count: Number.isFinite(count) ? Math.trunc(count) : 1 }
                                : op
                            )))
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}

                {transforms.length > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={addTransform}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Transform
                  </Button>
                )}
              </div>
            )}
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
