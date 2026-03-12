// Component: LiveApiPreview
// src/components/builder/live-api-preview.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Play, CheckCircle2, AlertCircle, Sparkles, ChevronRight,
} from 'lucide-react'
import { DataAnalyzer, DataAnalysis } from '@/lib/ai/data-analyzer'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { ChartType } from '@/types/widget'
import { toast } from 'sonner'

interface LiveAPIPreviewProps {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  endpointId?: string
  onAnalysisComplete?: (analysis: DataAnalysis) => void
}

type SuggestedChart = DataAnalysis['suggestedCharts'][0]

const CHART_TYPE_LABELS: Record<string, string> = {
  line: 'LINE',
  bar: 'BAR',
  area: 'AREA',
  pie: 'PIE',
  'grouped-bar': 'GROUPED',
  'horizontal-bar': 'H-BAR',
  'horizontal-stacked-bar': 'STACKED',
  'drilldown-bar': 'DRILLDOWN',
  gauge: 'GAUGE',
  'ring-gauge': 'RING',
  table: 'TABLE',
}

export function LiveAPIPreview({
  url,
  method,
  headers,
  endpointId,
  onAnalysisComplete,
}: LiveAPIPreviewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<any[] | null>(null)
  const [analysis, setAnalysis] = useState<DataAnalysis | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProps, setDialogProps] = useState<{
    endpointId: string
    suggestedType: ChartType
    suggestedXAxis: string
    suggestedYAxis: string
    availableFields: { name: string; type: string }[]
  } | null>(null)

  const handleTest = async () => {
    if (!url) {
      toast.error('Enter a URL first')
      return
    }

    setLoading(true)
    setError(null)
    setRawData(null)
    setAnalysis(null)

    try {
      const res = await fetch(
        url,
        buildEndpointRequestInit({
          method,
          headers,
          body: {},
        }),
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const json = await res.json()
      const dataArray =
        DataAnalyzer.extractDataArray(json) ??
        (Array.isArray(json) ? json : [json])

      setRawData(dataArray.slice(0, 5))

      // ✅ Fixed: analyzeArray() not analyze()
      const result = DataAnalyzer.analyzeArray(dataArray)
      setAnalysis(result)
      onAnalysisComplete?.(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openWidgetDialogFromSuggestion = (suggestion: SuggestedChart) => {
    if (!endpointId) {
      toast.error('Save the endpoint first before adding widgets')
      return
    }
    if (!analysis) return

    const xAxis = suggestion.xAxis ?? suggestion.groupBy ?? analysis.fields[0]?.name
    const yAxis = suggestion.yAxis ?? analysis.fields[1]?.name

    if (!xAxis || !yAxis) {
      toast.error('Could not determine axes from this suggestion')
      return
    }

    setDialogProps({
      endpointId,
      suggestedType: suggestion.type as ChartType,
      suggestedXAxis: xAxis,
      suggestedYAxis: yAxis,
      availableFields: analysis.fields,
    })
    setDialogOpen(true)
  }

  const openWidgetDialogManual = () => {
    if (!endpointId) {
      toast.error('Save the endpoint first before adding widgets')
      return
    }
    if (!analysis || analysis.fields.length < 2) {
      toast.error('Not enough fields detected to create a widget')
      return
    }
    const [x, y] = analysis.fields
    setDialogProps({
      endpointId,
      suggestedType: 'bar',
      suggestedXAxis: x.name,
      suggestedYAxis: y.name,
      availableFields: analysis.fields,
    })
    setDialogOpen(true)
  }

  const actionableSuggestions =
    analysis?.suggestedCharts
      .filter(s => s.type !== 'table' && (s.xAxis || s.groupBy))
      .slice(0, 3) ?? []

  return (
    <div className="space-y-3">
      {/* Test button */}
      <Button
        size="sm"
        onClick={handleTest}
        disabled={loading || !url}
        className="w-full"
      >
        {loading
          ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          : <Play className="w-3.5 h-3.5 mr-1.5" />
        }
        {loading ? 'Analyzing…' : 'Test & Analyze'}
      </Button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50/50">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-700">{error}</p>
        </div>
      )}

      {/* Analysis results */}
      {analysis && rawData && (
        <div className="space-y-3">
          {/* Status */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50/60 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
            <p className="text-[11px] font-medium text-green-800 dark:text-green-200">
              {analysis.totalRecords} rows · {analysis.fields.length} fields detected
            </p>
          </div>

          {/* Fields */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Fields
            </p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.fields.map(field => (
                <Badge key={field.name} variant="outline" className="text-[10px] px-2 py-0.5">
                  {field.name}
                  <span className="ml-1 text-muted-foreground">{field.type}</span>
                </Badge>
              ))}
            </div>
          </div>

          {/* AI Suggestions */}
          {actionableSuggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3 h-3 text-purple-500" />
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  AI Suggestions
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                {actionableSuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => openWidgetDialogFromSuggestion(suggestion)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-muted-foreground/20 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 w-9 flex-shrink-0">
                        {CHART_TYPE_LABELS[suggestion.type] ?? suggestion.type.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">
                        {suggestion.xAxis ?? suggestion.groupBy} vs {suggestion.yAxis}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <Badge variant="secondary" className="text-[9px] px-1.5">
                        {suggestion.confidence}%
                      </Badge>
                      <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual fallback */}
          <Button
            size="sm"
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={openWidgetDialogManual}
          >
            Manual Setup (pick fields yourself)
          </Button>

          {/* Raw preview */}
          <details>
            <summary className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
              Raw Preview (first 5 rows)
            </summary>
            <div className="mt-2 overflow-auto max-h-[160px] rounded-lg border bg-muted/30">
              <pre className="text-[10px] p-3 leading-relaxed">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}

      {/* Widget Config Dialog */}
      {dialogProps && (
        <WidgetConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          {...dialogProps}
        />
      )}
    </div>
  )
}
