'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import type { ChartType, LabelFormat, Widget } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import { saveEndpointMappingFeedback } from '@/lib/training/profile-client'
import {
  getWidgetSizeFromPreset,
  getWidgetSizePreset,
  WIDGET_SIZE_LABEL,
  type WidgetSizePreset,
} from '@/lib/builder/widget-size'
import { toast } from 'sonner'
import {
  AlignLeft,
  AreaChart,
  BarChart3,
  Circle,
  Gauge,
  LineChart,
  Loader2,
  PieChart,
  Table2,
  TrendingUp,
} from 'lucide-react'

interface WidgetEditDialogProps {
  widget: Widget
  open: boolean
  onOpenChange: (open: boolean) => void
}

const chartIcons: Record<ChartType, LucideIcon> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  donut: Circle,
  'horizontal-bar': AlignLeft,
  'horizontal-stacked-bar': AlignLeft,
  'grouped-bar': BarChart3,
  'drilldown-bar': BarChart3,
  gauge: Gauge,
  'ring-gauge': Gauge,
  'status-card': TrendingUp,
  table: Table2,
}

const chartTypeLabel: Record<ChartType, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
  'horizontal-bar': 'H-Bar',
  'horizontal-stacked-bar': 'Stacked H-Bar',
  'grouped-bar': 'Grouped',
  'drilldown-bar': 'Drilldown',
  gauge: 'Gauge',
  'ring-gauge': 'Ring',
  'status-card': 'KPI',
  table: 'Table',
}

const CHART_TYPE_ROWS: ChartType[][] = [
  ['bar', 'line', 'area', 'pie', 'donut', 'grouped-bar'],
  ['horizontal-bar', 'horizontal-stacked-bar', 'drilldown-bar'],
  ['gauge', 'ring-gauge', 'status-card', 'table'],
]

const FORMAT_OPTIONS: Array<{ value: 'number' | LabelFormat; label: string }> = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
]
const SIZE_PRESETS: WidgetSizePreset[] = ['small', 'medium', 'large', 'full']

function normalizeColors(colors: string[] | undefined): string[] {
  const fallback = DEFAULT_STYLE.colors
  if (!colors || colors.length === 0) return [...fallback]
  const base = [...colors]
  while (base.length < fallback.length) {
    base.push(fallback[base.length])
  }
  return base.slice(0, fallback.length)
}

export function WidgetEditDialog({ widget, open, onOpenChange }: WidgetEditDialogProps) {
  const { updateWidget, endpoints } = useDashboardStore()

  const [title, setTitle] = useState(widget.title)
  const [type, setType] = useState<ChartType>(widget.type)
  const [xAxis, setXAxis] = useState(widget.dataMapping.xAxis)
  const [yAxis, setYAxis] = useState(widget.dataMapping.yAxis ?? '')
  const [fields, setFields] = useState<Array<{ name: string; type: string }>>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [showLegend, setShowLegend] = useState(widget.style.showLegend ?? true)
  const [showGrid, setShowGrid] = useState(widget.style.showGrid ?? true)
  const [barRadius, setBarRadius] = useState(widget.style.barRadius ?? 5)
  const [colors, setColors] = useState<string[]>(normalizeColors(widget.style.colors))
  const [sizePreset, setSizePreset] = useState<WidgetSizePreset>(getWidgetSizePreset(widget.position))
  const [labelFormat, setLabelFormat] = useState<'number' | LabelFormat>(
    widget.style.labelFormat ?? 'number',
  )

  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(type)
  const hasGrid = !['pie', 'donut', 'gauge', 'ring-gauge', 'status-card'].includes(type)
  const supportsRadius = ['bar', 'horizontal-bar', 'grouped-bar', 'drilldown-bar'].includes(type)

  const fetchFields = async () => {
    if (!endpoint) return
    setLoadingFields(true)
    try {
      const response = await fetch(
        endpoint.url,
        buildEndpointRequestInit({
          method: endpoint.method,
          headers: endpoint.headers,
          body: endpoint.body,
        }),
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const payload = await response.json()
      const dataArray =
        DataAnalyzer.extractDataArray(payload) ??
        (Array.isArray(payload) ? payload : [payload])
      const analysis = DataAnalyzer.analyzeArray(dataArray)
      setFields(analysis.fields)
    } catch {
      setFields([
        { name: widget.dataMapping.xAxis, type: 'string' },
        ...(widget.dataMapping.yAxis ? [{ name: widget.dataMapping.yAxis, type: 'number' }] : []),
      ])
    } finally {
      setLoadingFields(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setTitle(widget.title)
    setType(widget.type)
    setXAxis(widget.dataMapping.xAxis)
    setYAxis(widget.dataMapping.yAxis ?? '')
    setShowLegend(widget.style.showLegend ?? true)
    setShowGrid(widget.style.showGrid ?? true)
    setBarRadius(widget.style.barRadius ?? 5)
    setColors(normalizeColors(widget.style.colors))
    setSizePreset(getWidgetSizePreset(widget.position))
    setLabelFormat(widget.style.labelFormat ?? 'number')
    void fetchFields()
  }, [open, widget.id])

  const setColorAt = (index: number, value: string) => {
    setColors(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const resolvedStyle = useMemo(() => ({
    ...widget.style,
    colors,
    showLegend,
    showGrid: hasGrid ? showGrid : false,
    barRadius: supportsRadius ? barRadius : widget.style.barRadius,
    labelFormat: labelFormat === 'number' ? undefined : labelFormat,
  }), [barRadius, colors, hasGrid, labelFormat, showGrid, showLegend, supportsRadius, widget.style])

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (needsXAxis && !xAxis.trim()) {
      toast.error('X-axis is required for this chart type')
      return
    }

    const nextDataMapping = {
      ...widget.dataMapping,
      xAxis: xAxis.trim(),
      yAxis: yAxis.trim() || undefined,
      transforms: undefined,
    }
    const nextSize = getWidgetSizeFromPreset(sizePreset)
    const currentPosition = widget.position ?? { x: 0, y: 0, w: 6, h: 5 }

    updateWidget(widget.id, {
      title: title.trim(),
      type,
      dataMapping: nextDataMapping,
      style: resolvedStyle,
      position: {
        ...currentPosition,
        w: nextSize.w,
        h: nextSize.h,
      },
    })

    void saveEndpointMappingFeedback({
      dashboardId: widget.dashboardId,
      endpointId: widget.endpointId,
      widgetId: widget.id,
      sourceAction: 'edit_widget',
      acceptedMapping: {
        type,
        xAxis: xAxis.trim(),
        yAxis: yAxis.trim() || undefined,
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
      // Non-blocking feedback write.
    })

    toast.success('Widget updated')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Edit Widget</DialogTitle>
          <DialogDescription className="text-xs">
            Configure chart type, axes, and style for{' '}
            <span className="font-mono font-medium">{widget.title}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Widget Title *</Label>
            <Input
              className="h-9 text-sm"
              value={title}
              onChange={event => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Chart Type</Label>
            <div className="space-y-1.5">
              {CHART_TYPE_ROWS.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}
                >
                  {row.map(chartType => {
                    const Icon = chartIcons[chartType]
                    const selected = type === chartType
                    return (
                      <button
                        key={chartType}
                        type="button"
                        onClick={() => setType(chartType)}
                        className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-all ${
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-[10px] font-medium ${selected ? 'text-primary' : 'text-muted-foreground'}`}>
                          {chartTypeLabel[chartType]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className={`grid gap-3 ${needsXAxis ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {needsXAxis && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  X-Axis
                  {loadingFields && <Loader2 className="h-3 w-3 animate-spin" />}
                </Label>
                {fields.length > 0 ? (
                  <Select value={xAxis} onValueChange={setXAxis} disabled={loadingFields}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map(field => (
                        <SelectItem key={field.name} value={field.name}>
                          <div className="flex items-center gap-2">
                            <span>{field.name}</span>
                            <Badge variant="outline" className="px-1 py-0 text-[9px]">
                              {field.type}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-9 text-sm font-mono"
                    value={xAxis}
                    placeholder={loadingFields ? 'Fetching fields...' : 'e.g., month'}
                    onChange={event => setXAxis(event.target.value)}
                    disabled={loadingFields}
                  />
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs">
                {['gauge', 'ring-gauge', 'status-card'].includes(type) ? 'Value Field' : 'Y-Axis'}
                {loadingFields && <Loader2 className="h-3 w-3 animate-spin" />}
              </Label>
              {fields.length > 0 ? (
                <Select value={yAxis} onValueChange={setYAxis} disabled={loadingFields}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map(field => (
                      <SelectItem key={field.name} value={field.name}>
                        <div className="flex items-center gap-2">
                          <span>{field.name}</span>
                          <Badge variant="outline" className="px-1 py-0 text-[9px]">
                            {field.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-9 text-sm font-mono"
                  value={yAxis}
                  placeholder={loadingFields ? 'Fetching fields...' : 'e.g., value'}
                  onChange={event => setYAxis(event.target.value)}
                  disabled={loadingFields}
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Widget Size</Label>
            <Select
              value={sizePreset}
              onValueChange={(value) => setSizePreset(value as WidgetSizePreset)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZE_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {WIDGET_SIZE_LABEL[preset]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Styling</Label>
              <Badge variant="outline" className="text-[10px]">Widget Visuals</Badge>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {colors.slice(0, 6).map((color, index) => (
                <label key={index} className="relative cursor-pointer" title={color}>
                  <div className="h-8 w-8 rounded-md border" style={{ backgroundColor: color }} />
                  <input
                    type="color"
                    value={color}
                    onChange={event => setColorAt(index, event.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="text-xs">Show Legend</Label>
                <Switch checked={showLegend} onCheckedChange={setShowLegend} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="text-xs">Show Grid</Label>
                <Switch checked={showGrid} onCheckedChange={setShowGrid} disabled={!hasGrid} />
              </div>
            </div>

            {supportsRadius && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Bar Radius</Label>
                  <span className="text-xs text-muted-foreground">{barRadius}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={barRadius}
                  onChange={event => setBarRadius(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Value Format</Label>
              <Select
                value={labelFormat}
                onValueChange={(value: 'number' | LabelFormat) => setLabelFormat(value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-2.5">
            <p className="text-[11px] text-muted-foreground">
              Data source:{' '}
              <span className="font-medium text-foreground">{endpoint?.name ?? 'Unknown'}</span>
              {' · '}
              <span className="font-mono text-[10px]">{endpoint?.url ?? 'N/A'}</span>
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
