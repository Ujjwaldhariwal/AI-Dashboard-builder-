'use client'

import { useState, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { ChartType } from '@/types/widget'
import { toast } from 'sonner'
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  Table2,
} from 'lucide-react'

interface WidgetConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  // Optional when opened from API Config
  endpointId?: string
  suggestedType?: ChartType
  suggestedXAxis?: string
  suggestedYAxis?: string
  availableFields?: Array<{ name: string; type: string }>
}

const chartIcons: Record<ChartType, any> = {
  line: LineChart,
  bar: BarChart3,
  pie: PieChart,
  area: AreaChart,
  table: Table2,
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
  const { addWidget, endpoints, currentDashboardId } = useDashboardStore()

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ChartType>('bar')
  const [xAxis, setXAxis] = useState('')
  const [yAxis, setYAxis] = useState('')

  // Endpoint: either the one passed in, or first in list
  const endpoint = endpointId
    ? endpoints.find(e => e.id === endpointId)
    : endpoints[0]

  // Fallback for available fields: if none passed, just use empty list
  const effectiveFields = availableFields ?? []

  useEffect(() => {
    if (!open) return

    setType(suggestedType ?? 'bar')
    setXAxis(suggestedXAxis ?? effectiveFields[0]?.name ?? '')
    setYAxis(
      suggestedYAxis ??
        effectiveFields[1]?.name ??
        effectiveFields[0]?.name ??
        '',
    )
    setTitle(endpoint ? endpoint.name : '')
  }, [
    open,
    suggestedType,
    suggestedXAxis,
    suggestedYAxis,
    endpoint,
    effectiveFields,
  ])

  const handleCreate = () => {
    if (!endpoint) {
      toast.error('Please select an API endpoint first')
      return
    }
    if (!title.trim()) {
      toast.error('Please enter a widget title')
      return
    }
    if (!xAxis || !yAxis) {
      toast.error('Please select X and Y axes')
      return
    }

    // WidgetConfigInput in builder-store does NOT have dashboardId,
    // it will attach the current dashboard internally.
    addWidget({
      title: title.trim(),
      type,
      endpointId: endpoint.id,
      dataMapping: {
        xAxis,
        yAxis,
      },
    } as any)

    toast.success('✅ Widget added to dashboard')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Create Widget</DialogTitle>
          <DialogDescription className="text-xs">
            Configure a new widget using data from{' '}
            <span className="font-mono">
              {endpoint?.name || 'a connected API'}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Widget title *</Label>
            <Input
              className="h-9 text-sm"
              placeholder="e.g., Users by ID"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Endpoint selector when endpointId is not forced */}
          {!endpointId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Data source</Label>
              <Select
                value={endpoint?.id}
                onValueChange={id => {
                  const ep = endpoints.find(e => e.id === id)
                  if (!ep) return
                  setTitle(ep.name)
                  setXAxis('')
                  setYAxis('')
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select API endpoint" />
                </SelectTrigger>
                <SelectContent>
                  {endpoints.map(ep => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {ep.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Chart type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Chart type</Label>
            <div className="grid grid-cols-5 gap-2">
              {(['line', 'bar', 'pie', 'area', 'table'] as ChartType[]).map(
                chartType => {
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
                      <Icon
                        className={`w-5 h-5 ${
                          isSelected
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span
                        className={`text-[10px] font-medium ${
                          isSelected
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {chartType[0].toUpperCase() + chartType.slice(1)}
                      </span>
                    </button>
                  )
                },
              )}
            </div>
          </div>

          {/* X axis */}
          <div className="space-y-1.5">
            <Label className="text-xs">X-axis (horizontal)</Label>
            <Select value={xAxis} onValueChange={setXAxis}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {effectiveFields.map(field => (
                  <SelectItem key={field.name} value={field.name}>
                    <div className="flex items-center gap-2">
                      <span>{field.name}</span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0"
                      >
                        {field.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Y axis */}
          <div className="space-y-1.5">
            <Label className="text-xs">Y-axis (vertical)</Label>
            <Select value={yAxis} onValueChange={setYAxis}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {effectiveFields.map(field => (
                  <SelectItem key={field.name} value={field.name}>
                    <div className="flex items-center gap-2">
                      <span>{field.name}</span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0"
                      >
                        {field.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate}>
            Create widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
