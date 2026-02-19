'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { ChartType } from '@/types/widget'
import { toast } from 'sonner'
import { BarChart3, LineChart, PieChart, AreaChart, Table2 } from 'lucide-react'

interface WidgetConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpointId: string
  suggestedType: ChartType
  suggestedXAxis: string
  suggestedYAxis: string
  availableFields: Array<{ name: string; type: string }>
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
  const { addWidget, endpoints } = useDashboardStore()

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ChartType>(suggestedType)
  const [xAxis, setXAxis] = useState(suggestedXAxis)
  const [yAxis, setYAxis] = useState(suggestedYAxis)

  const endpoint = endpoints.find((e) => e.id === endpointId)

  useEffect(() => {
    if (open) {
      setType(suggestedType)
      setXAxis(suggestedXAxis)
      setYAxis(suggestedYAxis)
      setTitle(endpoint ? endpoint.name : '')
    }
  }, [open, suggestedType, suggestedXAxis, suggestedYAxis, endpoint])

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error('Please enter a widget title')
      return
    }
    if (!xAxis || !yAxis) {
      toast.error('Please select X and Y axes')
      return
    }

    addWidget({
      title: title.trim(),
      type,
      endpointId,
      xAxis,
      yAxis,
    })

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
            <span className="font-mono">{endpoint?.name || 'selected API'}</span>.
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
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Chart type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Chart type</Label>
            <div className="grid grid-cols-5 gap-2">
              {(['line', 'bar', 'pie', 'area', 'table'] as ChartType[]).map((chartType) => {
                const Icon = chartIcons[chartType]
                const isSelected = type === chartType
                return (
                  <button
                    key={chartType}
                    type="button"
                    onClick={() => setType(chartType)}
                    className={`
                      flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-all
                      ${isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}
                    `}
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

          {/* X axis */}
          <div className="space-y-1.5">
            <Label className="text-xs">X-axis (horizontal)</Label>
            <Select value={xAxis} onValueChange={setXAxis}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map((field) => (
                  <SelectItem key={field.name} value={field.name}>
                    <div className="flex items-center gap-2">
                      <span>{field.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
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
                {availableFields.map((field) => (
                  <SelectItem key={field.name} value={field.name}>
                    <div className="flex items-center gap-2">
                      <span>{field.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
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
