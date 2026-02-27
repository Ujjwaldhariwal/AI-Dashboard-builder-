'use client'

// Component: WidgetConfigDialog

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
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { toast } from 'sonner'
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  Table2,
  Loader2,
} from 'lucide-react'

interface WidgetConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
  'stat-card': BarChart3,
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
  const [type, setType] = useState<ChartType>('bar')
  const [xAxis, setXAxis] = useState('')
  const [yAxis, setYAxis] = useState('')
  const [fields, setFields] = useState<Array<{ name: string; type: string }>>([])
  const [loadingFields, setLoadingFields] = useState(false)

  // Active endpoint: forced one OR first in list
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>(
    endpointId ?? endpoints[0]?.id ?? '',
  )
  const endpoint = endpoints.find(e => e.id === selectedEndpointId)

  // When dialog opens: reset state + fetch fields
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

    if (availableFields?.length) {
      setFields(availableFields)
      setXAxis(suggestedXAxis ?? availableFields[0]?.name ?? '')
      setYAxis(suggestedYAxis ?? availableFields[1]?.name ?? availableFields[0]?.name ?? '')
    } else if (ep) {
      fetchFields(ep)
    }
  }, [open])

  // Fetch + parse fields live from endpoint
  const fetchFields = async (ep: { url: string; method: string }) => {
    setLoadingFields(true)
    setFields([])
    try {
      const res = await fetch(ep.url, { method: ep.method })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      const dataArray = Array.isArray(result)
        ? result
        : result.data ?? result.results ?? result.items ?? result

      const analysis = DataAnalyzer.analyzeArray(dataArray)
      setFields(analysis.fields)

      // Auto-select first two fields
      if (!suggestedXAxis) setXAxis(analysis.fields[0]?.name ?? '')
      if (!suggestedYAxis)
        setYAxis(analysis.fields[1]?.name ?? analysis.fields[0]?.name ?? '')
    } catch {
      toast.error('Could not fetch fields from endpoint. Enter axis names manually.')
      // Fallback: let user type
      setFields([])
    } finally {
      setLoadingFields(false)
    }
  }

  // When user changes endpoint in dropdown
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
    if (!xAxis) {
      toast.error('Please select or enter an X-axis field')
      return
    }

    addWidget({
      title: title.trim(),
      type,
      endpointId: endpoint.id,
      dataMapping: { xAxis, yAxis: yAxis || undefined },
    })

    toast.success('✅ Widget added to dashboard')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ✅ FIX 3: max-h + overflow-y-auto stops form overflow */}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          {/* Endpoint selector — only when not forced */}
          {!endpointId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Data source</Label>
              <Select
                value={selectedEndpointId}
                onValueChange={handleEndpointChange}
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
            <div className="grid grid-cols-5 gap-1.5">
              {(['line', 'bar', 'pie', 'area', 'table'] as ChartType[]).map(
                chartType => {
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
            <Label className="text-xs flex items-center gap-1.5">
              X-axis (horizontal)
              {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
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
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {field.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // ✅ Fallback: manual input when fields can't be fetched
              <Input
                className="h-9 text-sm font-mono"
                placeholder={loadingFields ? 'Fetching fields...' : 'e.g., month'}
                value={xAxis}
                onChange={e => setXAxis(e.target.value)}
                disabled={loadingFields}
              />
            )}
          </div>

          {/* Y axis */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              Y-axis (vertical)
              {loadingFields && <Loader2 className="w-3 h-3 animate-spin" />}
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
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
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
                placeholder={loadingFields ? 'Fetching fields...' : 'e.g., revenue'}
                value={yAxis}
                onChange={e => setYAxis(e.target.value)}
                disabled={loadingFields}
              />
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={loadingFields}>
            {loadingFields ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Loading fields...
              </>
            ) : (
              'Create widget'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
