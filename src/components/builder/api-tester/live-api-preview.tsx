'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, TrendingUp, Plus } from 'lucide-react'
import { DataAnalyzer, DataAnalysis } from '@/lib/ai/data-analyzer'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { useDashboardStore } from '@/store/builder-store'
import { toast } from 'sonner'

interface LiveAPIPreviewProps {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  onAnalysisComplete?: (analysis: DataAnalysis, data: any[]) => void
}

export function LiveAPIPreview({ url, method, headers, onAnalysisComplete }: LiveAPIPreviewProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any[] | null>(null)
  const [analysis, setAnalysis] = useState<DataAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Widget dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedChart, setSelectedChart] = useState<any>(null)
  const { endpoints } = useDashboardStore()

  // Find the endpoint ID for this URL
  const currentEndpoint = endpoints.find(e => e.url === url)

  const handleTest = async () => {
    if (!url) {
      toast.error('Please enter an API URL')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(url, {
        method,
        headers: headers || {},
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      const dataArray = Array.isArray(result) ? result : result.data || result.results || [result]

      setData(dataArray)

      const dataAnalysis = DataAnalyzer.analyze(dataArray)
      setAnalysis(dataAnalysis)

      if (onAnalysisComplete) {
        onAnalysisComplete(dataAnalysis, dataArray)
      }

      toast.success(`✅ Retrieved ${dataArray.length} records`)
    } catch (err: any) {
      setError(err.message)
      toast.error(`Failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleAddWidget = (chart: any) => {
    if (!currentEndpoint) {
      toast.error('Please save the endpoint first')
      return
    }
    setSelectedChart(chart)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleTest} disabled={loading} className="h-8">
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              Test & Analyze
            </>
          )}
        </Button>
        {data && (
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {data.length} records
          </Badge>
        )}
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
          <CardContent className="py-3 px-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-900 dark:text-red-100">Error</p>
                <p className="text-[11px] text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <div className="space-y-3">
          {/* Fields */}
          <div>
            <h4 className="text-xs font-semibold mb-1.5">
              Detected Fields ({analysis.fields.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {analysis.fields.map((field) => (
                <Badge key={field.name} variant="outline" className="text-[11px] px-2 py-0">
                  {field.name}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({field.type})
                  </span>
                </Badge>
              ))}
            </div>
          </div>

          {/* Chart suggestions with ADD buttons */}
          <div>
            <h4 className="text-xs font-semibold mb-1.5">AI Recommended Charts</h4>
            <div className="space-y-2">
              {analysis.suggestedCharts.map((chart, i) => (
                <div
                  key={i}
                  className="p-2.5 border rounded-lg bg-card"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={i === 0 ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {chart.type.toUpperCase()}
                      </Badge>
                      <span className="text-xs font-medium">{chart.confidence}% match</span>
                    </div>
                    {/* ADD BUTTON - Only show if endpoint is saved */}
                    {currentEndpoint && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2"
                        onClick={() => handleAddWidget(chart)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{chart.reason}</p>
                  {chart.xAxis && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      X: {chart.xAxis} {chart.yAxis && `→ Y: ${chart.yAxis}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Data preview */}
          <div>
            <h4 className="text-xs font-semibold mb-1.5">Data Preview (first 3 records)</h4>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {analysis.fields.slice(0, 5).map((field) => (
                      <th key={field.name} className="text-left p-2 font-medium text-[11px]">
                        {field.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b">
                      {analysis.fields.slice(0, 5).map((field) => (
                        <td key={field.name} className="p-2 text-[11px] text-muted-foreground">
                          {String(row[field.name] || 'N/A')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Widget Config Dialog */}
      {selectedChart && currentEndpoint && analysis && (
        <WidgetConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          endpointId={currentEndpoint.id}
          suggestedType={selectedChart.type}
          suggestedXAxis={selectedChart.xAxis || analysis.fields[0]?.name || ''}
          suggestedYAxis={selectedChart.yAxis || analysis.fields[1]?.name || ''}
          availableFields={analysis.fields}
        />
      )}
    </div>
  )
}
