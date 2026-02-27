// Component: WidgetEditDialog
// src/components/builder/widget-edit-dialog.tsx
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { Widget, ChartType } from '@/types/widget'
import { toast } from 'sonner'
import { BarChart3, LineChart, PieChart, AreaChart, Table2, Loader2 } from 'lucide-react'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'

interface WidgetEditDialogProps {
  widget: Widget
  open: boolean
  onOpenChange: (open: boolean) => void
}

const chartIcons: Record<string, any> = {
  line: LineChart,
  bar: BarChart3,
  pie: PieChart,
  area: AreaChart,
  table: Table2,
  'stat-card': BarChart3,
}

export function WidgetEditDialog({ widget, open, onOpenChange }: WidgetEditDialogProps) {
  const { updateWidget, endpoints } = useDashboardStore()

  const [title, setTitle] = useState(widget.title)
  const [type, setType] = useState<ChartType>(widget.type)
  const [xAxis, setXAxis] = useState(widget.dataMapping.xAxis)
  const [yAxis, setYAxis] = useState(widget.dataMapping.yAxis ?? '')
  const [fields, setFields] = useState<Array<{ name: string; type: string }>>([])
  const [loadingFields, setLoadingFields] = useState(false)

  const endpoint = endpoints.find(e => e.id === widget.endpointId)

  useEffect(() => {
    if (open) {
      setTitle(widget.title)
      setType(widget.type)
      setXAxis(widget.dataMapping.xAxis)
      setYAxis(widget.dataMapping.yAxis ?? '')
      fetchFields()
    }
  }, [open])

  const fetchFields = async () => {
    if (!endpoint) return
    setLoadingFields(true)
    try {
      const res = await fetch(endpoint.url, { method: endpoint.method })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      const dataArray = Array.isArray(result)
        ? result
        : result.data || result.results || [result]

      // ✅ Fixed: analyzeArray() not analyze()
      const analysis = DataAnalyzer.analyzeArray(dataArray)
      setFields(analysis.fields)
    } catch {
      // Fallback to existing axes if fetch fails
      setFields([
        { name: widget.dataMapping.xAxis, type: 'string' },
        { name: widget.dataMapping.yAxis ?? '', type: 'number' },
      ])
    } finally {
      setLoadingFields(false)
    }
  }

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
        yAxis,
      },
    })

    toast.success('Widget updated')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Edit Widget</DialogTitle>
          <DialogDescription className="text-xs">
            Update configuration for{' '}
            <span className="font-mono font-medium">{widget.title}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Widget Title *</Label>
            <Input
              className="h-9 text-sm"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Chart type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Chart Type</Label>
            <div className="grid grid-cols-5 gap-2">
              {(['line', 'bar', 'pie', 'area', 'table'] as ChartType[]).map(chartType => {
                const Icon = chartIcons[chartType]
                const isSelected = type === chartType
                return (
                  <button
                    key={chartType}
                    type="button"
                    onClick={() => setType(chartType)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-[10px] font-medium ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                      {chartType.charAt(0).toUpperCase() + chartType.slice(1)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Axes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                X-Axis
                {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
              <Select value={xAxis} onValueChange={setXAxis} disabled={loadingFields}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => (
                    <SelectItem key={f.name} value={f.name}>
                      <div className="flex items-center gap-2">
                        <span>{f.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{f.type}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                Y-Axis
                {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
              <Select value={yAxis} onValueChange={setYAxis} disabled={loadingFields}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => (
                    <SelectItem key={f.name} value={f.name}>
                      <div className="flex items-center gap-2">
                        <span>{f.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{f.type}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Endpoint info */}
          <div className="p-2.5 rounded-lg bg-muted/50 border">
            <p className="text-[11px] text-muted-foreground">
              Data source:{' '}
              <span className="font-medium text-foreground">{endpoint?.name ?? 'Unknown'}</span>
              {' · '}
              <span className="font-mono truncate">{endpoint?.url}</span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
