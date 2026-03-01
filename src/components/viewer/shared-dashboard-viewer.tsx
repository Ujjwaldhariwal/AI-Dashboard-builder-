'use client'

// src/components/viewer/shared-dashboard-viewer.tsx

import { useState, useEffect } from 'react'
import { SharePayload } from '@/lib/share-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import {
  LayoutGrid, RefreshCw, Clock,
  ExternalLink, Shield, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Inline chart renderer (no store dependency — reads from token payload) ──
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

interface SharedWidgetData {
  id: string
  title: string
  type: string
  data: any[]
  xAxis: string
  yAxis: string
  loading: boolean
  error: string | null
}

interface Props {
  payload: SharePayload
}

export function SharedDashboardViewer({ payload }: Props) {
  const [widgetData, setWidgetData] = useState<SharedWidgetData[]>(
    payload.widgets.map(w => ({
      id:      w.id,
      title:   w.title,
      type:    w.type,
      data:    [],
      xAxis:   w.xAxis,
      yAxis:   w.yAxis,
      loading: true,
      error:   null,
    })),
  )
  const [lastRefreshed, setLastRefreshed] = useState(new Date())
  const [refreshKey, setRefreshKey]       = useState(0)

  const fetchAll = async () => {
    const results = await Promise.allSettled(
      payload.widgets.map(async w => {
        const res  = await fetch(w.endpointUrl, { method: w.method })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const arr  = Array.isArray(json)
          ? json
          : Array.isArray(json?.data) ? json.data
          : Array.isArray(json?.results) ? json.results
          : [json]
        return { id: w.id, data: arr }
      }),
    )

    setWidgetData(prev =>
      prev.map((wd, i) => {
        const r = results[i]
        if (r.status === 'fulfilled') {
          return { ...wd, data: r.value.data, loading: false, error: null }
        } else {
          return { ...wd, loading: false, error: (r.reason as Error).message }
        }
      }),
    )
    setLastRefreshed(new Date())
  }

  useEffect(() => {
    fetchAll()
  }, [refreshKey])

  const handleRefresh = () => {
    setWidgetData(prev => prev.map(w => ({ ...w, loading: true, error: null })))
    setRefreshKey(k => k + 1)
    toast.success('Refreshing all widgets...')
  }

  const renderChart = (wd: SharedWidgetData) => {
    if (wd.loading) {
      return (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (wd.error) {
      return (
        <div className="flex items-center justify-center h-48 text-red-500 text-sm">
          Failed: {wd.error}
        </div>
      )
    }
    if (!wd.data.length) {
      return (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data
        </div>
      )
    }

    switch (wd.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={wd.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={wd.xAxis} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey={wd.yAxis} fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={wd.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={wd.xAxis} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line dataKey={wd.yAxis} stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={wd.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={wd.xAxis} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area dataKey={wd.yAxis} stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'pie':
      case 'donut': {
        const pieData = wd.data.slice(0, 8).map(d => ({
          name:  d[wd.xAxis],
          value: Number(d[wd.yAxis]) || 0,
        }))
        return (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius={wd.type === 'donut' ? 50 : 0}
                outerRadius={80}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )
      }

      case 'table': {
        const cols = Object.keys(wd.data[0] ?? {}).slice(0, 5)
        return (
          <div className="overflow-auto max-h-[220px] rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {cols.map(c => (
                    <th key={c} className="text-left p-2 font-medium border-b whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wd.data.slice(0, 30).map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    {cols.map(c => (
                      <td key={c} className="p-2 max-w-[120px] truncate">
                        {String(row[c] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      default:
        return (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Chart type: {wd.type}
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-background">

      {/* Header */}
      <header className="border-b bg-card/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">{payload.dashboardName}</h1>
              <p className="text-xs text-muted-foreground">Shared read-only view</p>
            </div>
            <Badge variant="secondary" className="text-[10px] flex-shrink-0">
              {payload.widgets.length} widget{payload.widgets.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open Builder
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Read-only banner */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            This is a read-only shared view. Data is fetched live from the original API endpoints.
          </p>
        </div>
      </div>

      {/* Widget grid */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {widgetData.map((wd, i) => (
            <motion.div
              key={wd.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2 px-4 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm truncate">{wd.title}</CardTitle>
                    <Badge variant="outline" className="text-[10px] px-1.5 flex-shrink-0">
                      {wd.type.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {wd.xAxis} → {wd.yAxis}
                  </p>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {renderChart(wd)}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            Shared from Analytics AI Dashboard Builder ·{' '}
            {new Date(payload.exportedAt).toLocaleDateString()}
          </p>
        </div>
      </main>
    </div>
  )
}
