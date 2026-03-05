'use client'

// Module: Chart Suggester — AI suggestions with style seed support
// src/components/builder/ai-assistant/chart-suggester.tsx

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wand2, Loader2, Plus, RefreshCw,
  BarChart3, LineChart, PieChart, Table2,
  AreaChart, Circle, AlignLeft, Gauge, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { generateAIChartSuggestions, AIChartSuggestion } from '@/lib/ai/chart-generator'
import { toast } from 'sonner'
import { ChartType } from '@/types/widget'

const CHART_ICONS: Record<ChartType, any> = {
  bar:              BarChart3,
  line:             LineChart,
  area:             AreaChart,
  pie:              PieChart,
  donut:            Circle,
  'horizontal-bar': AlignLeft,
  gauge:            Gauge,
  'status-card':    TrendingUp,
  table:            Table2,
}

interface ChartSuggesterProps {
  endpointId?: string
}

export function ChartSuggester({ endpointId }: ChartSuggesterProps) {
  const { endpoints, addWidget, currentDashboardId } = useDashboardStore()

  const [suggestions, setSuggestions] = useState<AIChartSuggestion[]>([])
  const [loading, setLoading]         = useState(false)
  const [source, setSource]           = useState<'ai' | 'heuristic' | null>(null)
  const [addedIds, setAddedIds]       = useState<Set<number>>(new Set())

  const endpoint = endpointId
    ? endpoints.find(e => e.id === endpointId)
    : endpoints[0]

  const handleAnalyze = async () => {
    if (!endpoint) { toast.error('No API connected. Add one in API Config.'); return }

    setLoading(true)
    setSuggestions([])
    setAddedIds(new Set())

    try {
      const res = await fetch(endpoint.url, { method: endpoint.method })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()

      const arr    = DataAnalyzer.extractDataArray(raw) ?? []
      const fields = DataAnalyzer.inferTypes(arr)

      if (!fields.length) throw new Error('No fields detected in API response')

      const result = await generateAIChartSuggestions(fields, arr, endpoint.name)
      setSuggestions(result.suggestions)
      setSource(result.source)

      toast.success(
        result.source === 'ai'
          ? `${result.suggestions.length} AI suggestions generated`
          : `${result.suggestions.length} suggestions (offline mode)`,
      )
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = (suggestion: AIChartSuggestion, index: number) => {
    if (!currentDashboardId || !endpoint) {
      toast.error('No dashboard or endpoint selected')
      return
    }

    // Widget created with default style — AI can customize it later via chatbot
    addWidget({
      title:      suggestion.title,
      type:       suggestion.type,
      endpointId: endpoint.id,
      dataMapping: {
        xAxis: suggestion.xAxis,
        yAxis: suggestion.yAxis,
      },
    })

    setAddedIds(prev => new Set(prev).add(index))
    toast.success(`"${suggestion.title}" added! Select it on the canvas to style with AI.`)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-purple-500" />
          <p className="text-sm font-semibold">AI Chart Suggestions</p>
          {source && (
            <Badge
              variant={source === 'ai' ? 'default' : 'secondary'}
              className="text-[10px]"
            >
              {source === 'ai' ? 'GPT-4o mini' : 'Heuristic'}
            </Badge>
          )}
        </div>
        <Button
          variant="outline" size="sm"
          onClick={handleAnalyze}
          disabled={loading || !endpoint}
          className="h-7 text-xs gap-1.5"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : suggestions.length ? (
            <RefreshCw className="w-3 h-3" />
          ) : (
            <Wand2 className="w-3 h-3" />
          )}
          {loading ? 'Analyzing...' : suggestions.length ? 'Re-analyze' : 'Analyze API'}
        </Button>
      </div>

      {!endpoint && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Connect an API in API Config to get suggestions.
        </p>
      )}

      <AnimatePresence>
        {suggestions.map((s, i) => {
          const Icon    = CHART_ICONS[s.type] ?? BarChart3
          const isAdded = addedIds.has(i)

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold truncate">{s.title}</p>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{s.type}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{s.reason}</p>
                <div className="flex gap-1.5 mt-1.5">
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">X: {s.xAxis}</span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">Y: {s.yAxis}</span>
                </div>
              </div>
              <Button
                size="sm"
                variant={isAdded ? 'secondary' : 'default'}
                disabled={isAdded}
                onClick={() => handleAdd(s, i)}
                className="h-7 px-2.5 text-xs flex-shrink-0"
              >
                {isAdded ? '✓ Added' : <><Plus className="w-3 h-3 mr-1" />Add</>}
              </Button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
