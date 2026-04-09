'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Database,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useDashboardStore } from '@/store/builder-store'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { askDataTransformer } from '@/lib/ai/agent-client'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import { applyTransforms } from '@/lib/builder/data-transformer'
import { saveTransformBlueprint } from '@/lib/training/transform-blueprint-client'
import type { TransformFilterOperator, TransformMathOperator, TransformOp } from '@/types/widget'
import { toast } from 'sonner'

interface DataPrepModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpointId?: string | null
}

type TransformType = TransformOp['type']

const TRANSFORM_TYPE_LABELS: Record<TransformType, string> = {
  parse_number: 'Parse Number',
  concat: 'Concat Fields',
  rename: 'Rename Field',
  math: 'Math',
  percent_of_total: 'Percent of Total',
  filter_rows: 'Filter Rows',
  sort: 'Sort',
  limit: 'Limit',
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

const FILTER_OPERATORS: TransformFilterOperator[] = ['>', '<', '=', '!=', '>=', '<=']
const MATH_OPERATORS: TransformMathOperator[] = ['+', '-', '*', '/']
const SORT_ORDERS: Array<{ value: 'asc' | 'desc'; label: string }> = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
]

function createDefaultTransform(type: TransformType): TransformOp {
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

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const isMathOperator = (value: unknown): value is TransformMathOperator =>
  value === '+' || value === '-' || value === '*' || value === '/'

const isFilterOperator = (value: unknown): value is TransformFilterOperator =>
  value === '>' || value === '<' || value === '=' || value === '!=' || value === '>=' || value === '<='

const isSortOrder = (value: unknown): value is 'asc' | 'desc' =>
  value === 'asc' || value === 'desc'

const isTransformOp = (value: unknown): value is TransformOp => {
  const record = asRecord(value)
  if (!record || typeof record.type !== 'string') return false

  switch (record.type) {
    case 'parse_number':
      return typeof record.field === 'string'
    case 'concat':
      return Array.isArray(record.fields)
        && record.fields.every(field => typeof field === 'string')
        && typeof record.separator === 'string'
        && typeof record.outputField === 'string'
    case 'rename':
      return typeof record.from === 'string' && typeof record.to === 'string'
    case 'math':
      return typeof record.field === 'string'
        && isMathOperator(record.operator)
        && typeof record.value === 'number'
        && Number.isFinite(record.value)
        && typeof record.outputField === 'string'
    case 'percent_of_total':
      return typeof record.field === 'string' && typeof record.outputField === 'string'
    case 'filter_rows':
      return typeof record.field === 'string' && isFilterOperator(record.operator)
    case 'sort':
      return typeof record.field === 'string' && isSortOrder(record.order)
    case 'limit':
      return typeof record.count === 'number' && Number.isFinite(record.count)
    default:
      return false
  }
}

function parseTransformOpsFromPrompt(prompt: string): TransformOp[] | null {
  const trimmed = prompt.trim()
  if (!trimmed) return null

  const normalized = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    const parsed = JSON.parse(normalized) as unknown
    if (Array.isArray(parsed) && parsed.every(isTransformOp)) {
      return parsed
    }
    if (
      parsed
      && typeof parsed === 'object'
      && 'operations' in parsed
      && Array.isArray((parsed as { operations?: unknown }).operations)
      && (parsed as { operations: unknown[] }).operations.every(isTransformOp)
    ) {
      return (parsed as { operations: TransformOp[] }).operations
    }
    return null
  } catch {
    return null
  }
}

function PreviewTable({
  title,
  rows,
  isLoading,
}: {
  title: string
  rows: Record<string, unknown>[]
  isLoading?: boolean
}) {
  const columns = rows.length > 0 ? Object.keys(rows[0]).slice(0, 8) : []

  return (
    <div className="flex min-h-[220px] flex-col overflow-hidden rounded-xl border border-border/70 bg-background/80">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
        <p className="text-xs font-semibold leading-none">{title}</p>
        <Badge variant="outline" className="text-[10px]">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Loading preview...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
            No rows available
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10 bg-muted/90">
              <tr>
                {columns.map(column => (
                  <th
                    key={column}
                    className="whitespace-nowrap border-b px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, index) => (
                <tr key={index} className="border-b last:border-b-0">
                  {columns.map(column => (
                    <td key={column} className="max-w-[220px] truncate px-2.5 py-2 align-top">
                      {String(row[column] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

interface TransformStepEditorProps {
  index: number
  transform: TransformOp
  totalSteps: number
  updateTransform: (index: number, updater: (transform: TransformOp) => TransformOp) => void
  setTransformType: (index: number, type: TransformType) => void
  moveTransform: (index: number, direction: 'up' | 'down') => void
  removeTransform: (index: number) => void
}

function TransformStepEditor({
  index,
  transform,
  totalSteps,
  updateTransform,
  setTransformType,
  moveTransform,
  removeTransform,
}: TransformStepEditorProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-xl border border-border/70 bg-background/75 p-3.5 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-sm transition-colors hover:border-cyan-300/40"
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-6 px-2 font-mono text-[10px]">
            Step {index + 1}
          </Badge>
          <Select
            value={transform.type}
            onValueChange={(value: TransformType) => setTransformType(index, value)}
          >
            <SelectTrigger className="h-8 w-full min-w-[180px] text-xs sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSFORM_TYPE_ORDER.map(type => (
                <SelectItem key={type} value={type}>
                  {TRANSFORM_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => moveTransform(index, 'up')}
            disabled={index === 0}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => moveTransform(index, 'down')}
            disabled={index === totalSteps - 1}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-600 hover:text-red-700"
            onClick={() => removeTransform(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {transform.type === 'parse_number' && (
        <div className="space-y-1">
          <Label className="text-[11px]">Field</Label>
          <Input
            className="h-8 text-xs"
            list="data-prep-fields"
            value={transform.field}
            onChange={event => {
              const field = event.target.value
              updateTransform(index, op => (
                op.type === 'parse_number' ? { ...op, field } : op
              ))
            }}
          />
        </div>
      )}

      {transform.type === 'concat' && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Fields (comma separated)</Label>
            <Input
              className="h-8 text-xs"
              value={transform.fields.join(', ')}
              onChange={event => {
                const fields = event.target.value
                  .split(',')
                  .map(field => field.trim())
                  .filter(Boolean)
                updateTransform(index, op => (
                  op.type === 'concat' ? { ...op, fields } : op
                ))
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Separator</Label>
            <Input
              className="h-8 text-xs"
              value={transform.separator}
              onChange={event => {
                const separator = event.target.value
                updateTransform(index, op => (
                  op.type === 'concat' ? { ...op, separator } : op
                ))
              }}
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-[11px]">Output field</Label>
            <Input
              className="h-8 text-xs"
              value={transform.outputField}
              onChange={event => {
                const outputField = event.target.value
                updateTransform(index, op => (
                  op.type === 'concat' ? { ...op, outputField } : op
                ))
              }}
            />
          </div>
        </div>
      )}

      {transform.type === 'rename' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">From</Label>
            <Input
              className="h-8 text-xs"
              list="data-prep-fields"
              value={transform.from}
              onChange={event => {
                const from = event.target.value
                updateTransform(index, op => (
                  op.type === 'rename' ? { ...op, from } : op
                ))
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">To</Label>
            <Input
              className="h-8 text-xs"
              value={transform.to}
              onChange={event => {
                const to = event.target.value
                updateTransform(index, op => (
                  op.type === 'rename' ? { ...op, to } : op
                ))
              }}
            />
          </div>
        </div>
      )}

      {transform.type === 'math' && (
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Field</Label>
            <Input
              className="h-8 text-xs"
              list="data-prep-fields"
              value={transform.field}
              onChange={event => {
                const field = event.target.value
                updateTransform(index, op => (
                  op.type === 'math' ? { ...op, field } : op
                ))
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Operator</Label>
            <Select
              value={transform.operator}
              onValueChange={(operator: TransformMathOperator) => {
                updateTransform(index, op => (
                  op.type === 'math' ? { ...op, operator } : op
                ))
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATH_OPERATORS.map(operator => (
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
              type="number"
              value={transform.value}
              onChange={event => {
                const value = Number(event.target.value)
                updateTransform(index, op => (
                  op.type === 'math'
                    ? { ...op, value: Number.isFinite(value) ? value : 0 }
                    : op
                ))
              }}
            />
          </div>
          <div className="space-y-1 sm:col-span-4">
            <Label className="text-[11px]">Output field</Label>
            <Input
              className="h-8 text-xs"
              value={transform.outputField}
              onChange={event => {
                const outputField = event.target.value
                updateTransform(index, op => (
                  op.type === 'math' ? { ...op, outputField } : op
                ))
              }}
            />
          </div>
        </div>
      )}

      {transform.type === 'percent_of_total' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Field</Label>
            <Input
              className="h-8 text-xs"
              list="data-prep-fields"
              value={transform.field}
              onChange={event => {
                const field = event.target.value
                updateTransform(index, op => (
                  op.type === 'percent_of_total' ? { ...op, field } : op
                ))
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Output field</Label>
            <Input
              className="h-8 text-xs"
              value={transform.outputField}
              onChange={event => {
                const outputField = event.target.value
                updateTransform(index, op => (
                  op.type === 'percent_of_total' ? { ...op, outputField } : op
                ))
              }}
            />
          </div>
        </div>
      )}

      {transform.type === 'filter_rows' && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Field</Label>
            <Input
              className="h-8 text-xs"
              list="data-prep-fields"
              value={transform.field}
              onChange={event => {
                const field = event.target.value
                updateTransform(index, op => (
                  op.type === 'filter_rows' ? { ...op, field } : op
                ))
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Operator</Label>
            <Select
              value={transform.operator}
              onValueChange={(operator: TransformFilterOperator) => {
                updateTransform(index, op => (
                  op.type === 'filter_rows' ? { ...op, operator } : op
                ))
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
              value={String(transform.value ?? '')}
              onChange={event => {
                const value = event.target.value
                updateTransform(index, op => (
                  op.type === 'filter_rows' ? { ...op, value } : op
                ))
              }}
            />
          </div>
        </div>
      )}

      {transform.type === 'sort' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Field</Label>
            <Input
              className="h-8 text-xs"
              list="data-prep-fields"
              value={transform.field}
              onChange={event => {
                const field = event.target.value
                updateTransform(index, op => (
                  op.type === 'sort' ? { ...op, field } : op
                ))
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Order</Label>
            <Select
              value={transform.order}
              onValueChange={(order: 'asc' | 'desc') => {
                updateTransform(index, op => (
                  op.type === 'sort' ? { ...op, order } : op
                ))
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_ORDERS.map(order => (
                  <SelectItem key={order.value} value={order.value}>
                    {order.label}
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
            onChange={event => {
              const count = Number(event.target.value)
              updateTransform(index, op => (
                op.type === 'limit'
                  ? { ...op, count: Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1 }
                  : op
              ))
            }}
          />
        </div>
      )}
    </motion.div>
  )
}

export function DataPrepModal({ open, onOpenChange, endpointId }: DataPrepModalProps) {
  const {
    currentDashboardId,
    endpoints,
    updateEndpointTransforms,
  } = useDashboardStore()

  const scopedEndpoints = useMemo(
    () => endpoints.filter(endpoint => (endpoint.dashboardId ?? currentDashboardId) === currentDashboardId),
    [currentDashboardId, endpoints],
  )
  const availableEndpoints = scopedEndpoints.length > 0 ? scopedEndpoints : endpoints

  const [activeEndpointId, setActiveEndpointId] = useState<string | null>(endpointId ?? null)
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [transforms, setTransforms] = useState<TransformOp[]>([])
  const [aiPrompt, setAiPrompt] = useState('')
  const [loadingRaw, setLoadingRaw] = useState(false)
  const [generatingTransforms, setGeneratingTransforms] = useState(false)
  const [savingTransforms, setSavingTransforms] = useState(false)
  const [savingBlueprint, setSavingBlueprint] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const lastLoadedEndpointRef = useRef<string | null>(null)

  const activeEndpoint = useMemo(
    () => availableEndpoints.find(endpoint => endpoint.id === activeEndpointId) ?? null,
    [activeEndpointId, availableEndpoints],
  )

  const transformedRows = useMemo(() => applyTransforms(rawRows, transforms), [rawRows, transforms])

  const fieldOptions = useMemo(() => {
    const keys = new Set<string>()
    rawRows.slice(0, 25).forEach(row => {
      Object.keys(row).forEach(key => keys.add(key))
    })
    return Array.from(keys)
  }, [rawRows])

  const fetchRawData = useCallback(async (endpoint: (typeof availableEndpoints)[number]) => {
    setLoadingRaw(true)
    setRawError(null)
    try {
      const response = await fetch(
        endpoint.url,
        buildEndpointRequestInit({
          method: endpoint.method,
          headers: endpoint.headers,
          body: endpoint.body,
        }),
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const dataArray =
        DataAnalyzer.extractDataArray(payload) ??
        (Array.isArray(payload) ? payload : [payload])
      const normalizedRows = dataArray.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )

      setRawRows(normalizedRows)
      setLastLoadedAt(new Date())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRawRows([])
      setRawError(message)
      toast.error(`Failed to fetch raw data: ${message}`)
    } finally {
      setLoadingRaw(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      lastLoadedEndpointRef.current = null
      return
    }
    const preferred = (
      endpointId
      && availableEndpoints.some(endpoint => endpoint.id === endpointId)
    )
      ? endpointId
      : (availableEndpoints[0]?.id ?? null)
    setActiveEndpointId(preferred)
  }, [open, endpointId, availableEndpoints])

  useEffect(() => {
    if (!open || !activeEndpointId) return
    if (lastLoadedEndpointRef.current === activeEndpointId) return

    const endpoint = availableEndpoints.find(item => item.id === activeEndpointId)
    if (!endpoint) return

    lastLoadedEndpointRef.current = activeEndpointId
    setTransforms(endpoint.transforms ?? [])
    setAiPrompt('')
    void fetchRawData(endpoint)
  }, [activeEndpointId, availableEndpoints, fetchRawData, open])

  const updateTransform = useCallback(
    (index: number, updater: (transform: TransformOp) => TransformOp) => {
      setTransforms(prev => prev.map((transform, idx) => (
        idx === index ? updater(transform) : transform
      )))
    },
    [],
  )

  const addTransform = () => {
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

  const setTransformType = (index: number, type: TransformType) => {
    setTransforms(prev => prev.map((transform, idx) => (
      idx === index ? createDefaultTransform(type) : transform
    )))
  }

  const handleGenerateTransforms = async () => {
    if (!activeEndpoint) {
      toast.error('Select an endpoint first')
      return
    }
    if (rawRows.length === 0) {
      toast.error('Load raw data first before generating transforms')
      return
    }

    const prompt = aiPrompt.trim()
    if (!prompt) {
      toast.error('Describe the transform goal first')
      return
    }

    const parsedFromJson = parseTransformOpsFromPrompt(prompt)
    if (parsedFromJson) {
      setTransforms(parsedFromJson)
      toast.success(`Loaded ${parsedFromJson.length} transform step(s) from JSON`)
      return
    }

    setGeneratingTransforms(true)
    try {
      const generated = await askDataTransformer(prompt, rawRows.slice(0, 20), {
        dashboardId: currentDashboardId ?? undefined,
        endpointId: activeEndpoint.id,
        endpointName: activeEndpoint.name,
      })
      setTransforms(generated)
      toast.success(`Generated ${generated.length} transform step(s)`)
    } catch {
      // Error toast already handled in askDataTransformer.
    } finally {
      setGeneratingTransforms(false)
    }
  }

  const handleSaveEndpointTransforms = async () => {
    if (!activeEndpoint) {
      toast.error('Select an endpoint first')
      return
    }

    setSavingTransforms(true)
    try {
      updateEndpointTransforms(activeEndpoint.id, transforms)
      toast.success(`Saved ${transforms.length} transform step(s) to "${activeEndpoint.name}"`)
      onOpenChange(false)
    } finally {
      setSavingTransforms(false)
    }
  }

  const handleSaveBlueprint = async () => {
    if (!activeEndpoint) {
      toast.error('Select an endpoint first')
      return
    }

    setSavingBlueprint(true)
    try {
      const trimmedPrompt = aiPrompt.trim()
      const blueprint = {
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}`,
        endpointId: activeEndpoint.id,
        endpointName: activeEndpoint.name,
        createdAt: new Date().toISOString(),
        prompt: trimmedPrompt || undefined,
        transforms,
      }

      let cloudSaved = false
      try {
        await saveTransformBlueprint({
          dashboardId: currentDashboardId ?? undefined,
          endpointId: activeEndpoint.id,
          endpointName: activeEndpoint.name,
          prompt: trimmedPrompt || undefined,
          transforms,
          sampleData: rawRows.slice(0, 20),
        })
        cloudSaved = true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[Data Prep] Failed to save blueprint to memory bank:', message)
      }

      if (typeof window !== 'undefined') {
        const key = 'ai-dashboard-transform-blueprints'
        const currentRaw = window.localStorage.getItem(key)
        const current = currentRaw ? JSON.parse(currentRaw) : []
        const next = Array.isArray(current)
          ? [blueprint, ...current].slice(0, 50)
          : [blueprint]
        window.localStorage.setItem(key, JSON.stringify(next))
      }

      await navigator.clipboard.writeText(JSON.stringify(blueprint, null, 2))
      if (cloudSaved) {
        toast.success('AI blueprint saved to memory bank and copied to clipboard')
      } else {
        toast.success('AI blueprint saved locally and copied to clipboard')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save blueprint: ${message}`)
    } finally {
      setSavingBlueprint(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-[1560px] overflow-hidden rounded-2xl border border-white/30 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:w-[94vw]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_44%),radial-gradient(circle_at_22%_82%,rgba(59,130,246,0.09),transparent_48%)]" />
        <div className="relative flex h-full min-h-0 flex-col lg:flex-row">
          <aside className="flex h-[33vh] min-h-[210px] shrink-0 flex-col border-b border-border/70 bg-muted/20 p-3.5 lg:h-auto lg:w-[300px] lg:border-b-0 lg:border-r lg:p-4">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="rounded-lg border border-cyan-200/60 bg-cyan-500/10 p-1.5 text-cyan-700 dark:border-cyan-800/70 dark:text-cyan-300">
                <Database className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">Configured APIs</h3>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              Select an endpoint to load live raw data and build its transform pipeline.
            </p>

            <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
              {availableEndpoints.map(endpoint => {
                const selected = endpoint.id === activeEndpointId
                const stepCount = endpoint.transforms?.length ?? 0
                return (
                  <motion.button
                    key={endpoint.id}
                    type="button"
                    layout
                    onClick={() => {
                      setActiveEndpointId(endpoint.id)
                      lastLoadedEndpointRef.current = null
                    }}
                    className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                      selected
                        ? 'border-cyan-400/80 bg-cyan-500/10 shadow-sm shadow-cyan-500/10'
                        : 'border-border/70 bg-background/85 hover:border-cyan-300/70 hover:bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-xs font-semibold transition-colors ${selected ? 'text-foreground' : 'text-foreground/90 group-hover:text-foreground'}`}>
                        {endpoint.name}
                      </p>
                      <Badge variant={endpoint.status === 'active' ? 'default' : 'secondary'} className="h-6 px-2 text-[10px]">
                        {endpoint.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">
                      {endpoint.url}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="rounded-md border border-border/80 px-1.5 py-0.5 font-medium">{endpoint.method}</span>
                      <span>{stepCount} step{stepCount === 1 ? '' : 's'}</span>
                    </div>
                  </motion.button>
                )
              })}

              {availableEndpoints.length === 0 && (
                <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Add at least one endpoint to start data prep.
                </div>
              )}
            </div>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 border-b border-border/70 bg-background/85 px-4 py-4 md:px-5">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Wand2 className="h-4 w-4 text-cyan-600" />
                Data Prep Studio
              </DialogTitle>
              <DialogDescription className="text-xs">
                Build endpoint-level transforms so widgets receive clean, chart-ready data.
              </DialogDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-6 text-[10px]">
                  {activeEndpoint ? activeEndpoint.name : 'No endpoint selected'}
                </Badge>
                <Badge variant="outline" className="h-6 text-[10px]">
                  {transforms.length} step{transforms.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4 md:gap-4 md:px-5 md:py-5">
              <motion.section
                layout
                className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-sm md:p-3.5"
              >
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
                      <p className="text-xs font-semibold">AI Transform Planner</p>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Describe the transform, paste desired JSON, or paste old JavaScript logic.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-9 w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-xs text-white hover:from-cyan-600 hover:to-blue-700 sm:w-auto"
                    onClick={() => void handleGenerateTransforms()}
                    disabled={generatingTransforms || rawRows.length === 0}
                  >
                    {generatingTransforms ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                        Generate Transforms
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  className="min-h-[108px] resize-y text-xs"
                  placeholder="Example: Parse 'loss_percent', keep rows where status != 'offline', then sort by timestamp desc."
                  value={aiPrompt}
                  onChange={event => setAiPrompt(event.target.value)}
                />
              </motion.section>
              <div className="grid min-h-0 gap-3.5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-4">
                <motion.section
                  layout
                  className="flex min-h-[320px] flex-col rounded-xl border border-border/70 bg-background/80 p-3 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-sm md:p-3.5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold">Visual Transform Pipeline</p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Reorder and edit each operation before saving to endpoint.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="h-9 w-full text-xs sm:w-auto" onClick={addTransform}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Step
                    </Button>
                  </div>

                  <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    <AnimatePresence initial={false}>
                      {transforms.map((transform, index) => (
                        <TransformStepEditor
                          key={`${transform.type}-${index}`}
                          index={index}
                          transform={transform}
                          totalSteps={transforms.length}
                          updateTransform={updateTransform}
                          setTransformType={setTransformType}
                          moveTransform={moveTransform}
                          removeTransform={removeTransform}
                        />
                      ))}
                    </AnimatePresence>

                    {transforms.length === 0 && (
                      <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs text-muted-foreground">
                        No transform steps yet. Generate with AI or add a manual step.
                      </div>
                    )}
                  </div>
                </motion.section>

                <motion.section
                  layout
                  className="flex min-h-[320px] flex-col rounded-xl border border-border/70 bg-background/80 p-3 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-sm md:p-3.5"
                >
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold">Live Preview</span>
                      <ArrowRight className="h-3.5 w-3.5 text-cyan-600" />
                      {activeEndpoint && (
                        <span className="text-muted-foreground">
                          {activeEndpoint.name}
                        </span>
                      )}
                      {lastLoadedAt && (
                        <span className="text-muted-foreground">
                          (loaded {lastLoadedAt.toLocaleTimeString()})
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-full text-[11px] sm:w-auto"
                      onClick={() => activeEndpoint && void fetchRawData(activeEndpoint)}
                      disabled={!activeEndpoint || loadingRaw}
                    >
                      {loadingRaw ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        'Refresh Raw Data'
                      )}
                    </Button>
                  </div>

                  {rawError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                      {rawError}
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1">
                      <div className="grid h-full gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                        <PreviewTable title="Raw API Data (first 5 rows)" rows={rawRows.slice(0, 5)} isLoading={loadingRaw} />
                        <div className="hidden items-center justify-center lg:flex">
                          <ArrowRight className="h-4 w-4 text-cyan-600" />
                        </div>
                        <PreviewTable title="Transformed Data (real-time)" rows={transformedRows.slice(0, 5)} isLoading={loadingRaw} />
                      </div>
                    </div>
                  )}
                </motion.section>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border/70 bg-background/90 px-4 py-3 md:px-5 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void handleSaveBlueprint()}
                disabled={!activeEndpoint || savingBlueprint}
              >
                {savingBlueprint ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving Blueprint...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    Save as AI Blueprint
                  </>
                )}
              </Button>

              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 sm:flex-none"
                  onClick={() => void handleSaveEndpointTransforms()}
                  disabled={!activeEndpoint || savingTransforms}
                >
                  {savingTransforms ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save & Apply to Endpoint'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </div>

        <datalist id="data-prep-fields">
          {fieldOptions.map(field => (
            <option key={field} value={field} />
          ))}
        </datalist>
      </DialogContent>
    </Dialog>
  )
}
