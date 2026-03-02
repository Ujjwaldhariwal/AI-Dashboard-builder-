'use client'

// src/app/(builder)/monitoring/page.tsx

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, CheckCircle2, AlertTriangle, XCircle,
  Clock, Wifi, WifiOff, RefreshCw, Trash2,
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  BarChart3, Filter,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useMonitoringStore, LogLevel } from '@/store/monitoring-store'
import { useDashboardStore } from '@/store/builder-store'
import { useRouter } from 'next/navigation'

const levelIcon = {
  success: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  info:    <Activity className="w-3.5 h-3.5 text-blue-500" />,
  warn:    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  error:   <XCircle className="w-3.5 h-3.5 text-red-500" />,
}

const levelBadge: Record<LogLevel, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  info:    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  warn:    'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  error:   'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
}

const statusColor = {
  healthy:  { dot: '#22c55e', badge: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
  degraded: { dot: '#f59e0b', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  down:     { dot: '#ef4444', badge: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  unknown:  { dot: '#9ca3af', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400' },
}

export default function MonitoringPage() {
  const router = useRouter()
  const { logs, endpointHealth, clearLogs, getErrorCount } = useMonitoringStore()
  const { endpoints, widgets } = useDashboardStore()

  const [tab, setTab]               = useState<'overview' | 'logs' | 'health'>('overview')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [search, setSearch]         = useState('')

  // ── Derived stats ─────────────────────────────────────────────────────
  const errorCount   = getErrorCount()
  const warnCount    = logs.filter(l => l.level === 'warn').length
  const successCount = logs.filter(l => l.level === 'success').length
  const avgLatency   = logs.filter(l => l.latencyMs).length
    ? Math.round(
        logs.filter(l => l.latencyMs).reduce((s, l) => s + (l.latencyMs ?? 0), 0) /
        logs.filter(l => l.latencyMs).length,
      )
    : 0

  const healthList = endpoints.map(e => ({
    endpoint: e,
    health:   endpointHealth[e.id],
  }))
  const healthyCount  = healthList.filter(h => h.health?.status === 'healthy').length
  const downCount     = healthList.filter(h => h.health?.status === 'down').length
  const degradedCount = healthList.filter(h => h.health?.status === 'degraded').length

  // ── Filtered logs ─────────────────────────────────────────────────────
  const filteredLogs = logs.filter(l => {
    const matchLevel  = levelFilter === 'all' || l.level === levelFilter
    const matchSearch = !search ||
      l.widgetTitle.toLowerCase().includes(search.toLowerCase()) ||
      l.message.toLowerCase().includes(search.toLowerCase()) ||
      l.endpointUrl.toLowerCase().includes(search.toLowerCase())
    return matchLevel && matchSearch
  })

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const secs = Math.floor(diff / 1000)
    if (secs < 60)  return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60)  return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="h-9 w-9 rounded-xl border hover:bg-muted hover:scale-105 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">Monitoring</h1>
                {errorCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Real-time API health and widget performance logs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearLogs}
              disabled={logs.length === 0}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear Logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── KPI Cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label:   'Total Logs',
              value:   logs.length,
              icon:    <BarChart3 className="w-4 h-4 text-blue-600" />,
              bg:      'from-blue-600 to-blue-500',
              trend:   null,
            },
            {
              label:   'Errors',
              value:   errorCount,
              icon:    <XCircle className="w-4 h-4 text-red-600" />,
              bg:      'from-red-600 to-red-500',
              trend:   errorCount > 0 ? 'up' : 'neutral',
            },
            {
              label:   'Avg Latency',
              value:   `${avgLatency}ms`,
              icon:    <Clock className="w-4 h-4 text-purple-600" />,
              bg:      'from-purple-600 to-purple-500',
              trend:   avgLatency > 2000 ? 'up' : avgLatency > 0 ? 'down' : 'neutral',
            },
            {
              label:   'Healthy APIs',
              value:   `${healthyCount}/${endpoints.length}`,
              icon:    <Wifi className="w-4 h-4 text-green-600" />,
              bg:      'from-green-600 to-green-500',
              trend:   downCount > 0 ? 'up' : 'down',
            },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                    {stat.icon}
                  </div>
                </div>
                {stat.trend && (
                  <div className="flex items-center gap-1 mt-2">
                    {stat.trend === 'up'
                      ? <TrendingUp className="w-3 h-3 text-red-500" />
                      : stat.trend === 'down'
                      ? <TrendingDown className="w-3 h-3 text-green-500" />
                      : <Minus className="w-3 h-3 text-muted-foreground" />
                    }
                    <span className={`text-[10px] ${
                      stat.trend === 'up'
                        ? 'text-red-500'
                        : stat.trend === 'down'
                        ? 'text-green-500'
                        : 'text-muted-foreground'
                    }`}>
                      {stat.trend === 'neutral' ? 'No data yet' : stat.label === 'Errors' ? 'Needs attention' : stat.label === 'Avg Latency' ? 'Within range' : 'All healthy'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex border-b gap-1">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'logs',     label: `Logs (${logs.length})` },
            { key: 'health',   label: `API Health (${endpoints.length})` },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-5">

            {/* Recent errors */}
            <Card>
              <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  Recent Errors
                  {errorCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] ml-auto">
                      {errorCount}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-2">
                {logs.filter(l => l.level === 'error').slice(0, 5).length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No errors — all good!</p>
                  </div>
                ) : (
                  logs.filter(l => l.level === 'error').slice(0, 5).map(log => (
                    <div key={log.id} className="p-2.5 rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate">{log.widgetTitle}</p>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {timeAgo(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 truncate">
                        {log.message}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* API health summary */}
            <Card>
              <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-blue-500" />
                  API Health Summary
                </CardTitle>
                <CardDescription className="text-xs">
                  {healthyCount} healthy · {degradedCount} degraded · {downCount} down
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-2">
                {healthList.length === 0 ? (
                  <div className="py-6 text-center">
                    <WifiOff className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No APIs connected yet</p>
                  </div>
                ) : (
                  healthList.map(({ endpoint, health }) => {
                    const status = health?.status ?? 'unknown'
                    const sc     = statusColor[status]
                    return (
                      <div key={endpoint.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: sc.dot }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{endpoint.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            {endpoint.url}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {health?.latencyMs && (
                            <span className={`text-[10px] font-mono ${
                              health.latencyMs > 2000 ? 'text-amber-500' : 'text-green-600'
                            }`}>
                              {health.latencyMs}ms
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sc.badge}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Widget activity */}
            <Card className="md:col-span-2">
              <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-500" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {logs.slice(0, 8).length === 0 ? (
                  <div className="py-6 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      No activity yet — open the builder to start fetching data
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {logs.slice(0, 8).map(log => (
                      <div key={log.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                        {levelIcon[log.level]}
                        <span className="text-xs font-medium flex-shrink-0 w-32 truncate">
                          {log.widgetTitle}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex-1 truncate">
                          {log.message}
                        </span>
                        {log.latencyMs && (
                          <span className={`text-[10px] font-mono flex-shrink-0 ${
                            log.latencyMs > 2000 ? 'text-amber-500' : 'text-muted-foreground'
                          }`}>
                            {log.latencyMs}ms
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {timeAgo(log.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── LOGS TAB ─────────────────────────────────────────────────── */}
        {tab === 'logs' && (
          <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search widget, message, URL..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-8 text-sm pl-8"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'success', 'warn', 'error', 'info'].map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setLevelFilter(lvl)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium ${
                      levelFilter === lvl
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    {lvl === 'all' ? `All (${logs.length})` : `${lvl} (${logs.filter(l => l.level === lvl).length})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Log table */}
            <Card>
              <CardContent className="p-0">
                {filteredLogs.length === 0 ? (
                  <div className="py-16 text-center">
                    <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {logs.length === 0 ? 'No logs yet — open builder to generate activity' : 'No logs match your filter'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          {['Level', 'Widget', 'Message', 'Latency', 'Status', 'Time'].map(h => (
                            <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence initial={false}>
                          {filteredLogs.map((log, i) => (
                            <motion.tr
                              key={log.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="border-b hover:bg-muted/30 transition-colors"
                            >
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${levelBadge[log.level]}`}>
                                  {log.level}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-medium max-w-[120px] truncate">
                                {log.widgetTitle}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-[240px] truncate">
                                {log.message}
                              </td>
                              <td className="px-4 py-2.5 font-mono">
                                {log.latencyMs ? (
                                  <span className={log.latencyMs > 2000 ? 'text-amber-500' : 'text-green-600'}>
                                    {log.latencyMs}ms
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-muted-foreground">
                                {log.statusCode ? `HTTP ${log.statusCode}` : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                                {timeAgo(log.timestamp)}
                              </td>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── HEALTH TAB ───────────────────────────────────────────────── */}
        {tab === 'health' && (
          <div className="grid md:grid-cols-2 gap-4">
            {healthList.length === 0 ? (
              <div className="md:col-span-2 py-16 text-center">
                <WifiOff className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No APIs connected — add one in API Config
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => router.push('/api-config')}
                >
                  Go to API Config
                </Button>
              </div>
            ) : (
              healthList.map(({ endpoint, health }) => {
                const status = health?.status ?? 'unknown'
                const sc     = statusColor[status]
                const successRate = health
                  ? Math.round(
                      (health.successCount /
                        Math.max(health.successCount + health.errorCount, 1)) * 100,
                    )
                  : null

                return (
                  <Card key={endpoint.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-offset-2"
                            style={{
                              backgroundColor: sc.dot,
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{endpoint.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                              {endpoint.url}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${sc.badge}`}>
                          {status}
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          {
                            label: 'Latency',
                            value: health?.latencyMs ? `${health.latencyMs}ms` : '—',
                            color: health?.latencyMs && health.latencyMs > 2000
                              ? 'text-amber-500'
                              : 'text-green-600',
                          },
                          {
                            label: 'Success',
                            value: health?.successCount ?? 0,
                            color: 'text-green-600',
                          },
                          {
                            label: 'Errors',
                            value: health?.errorCount ?? 0,
                            color: health?.errorCount ? 'text-red-500' : 'text-muted-foreground',
                          },
                        ].map(s => (
                          <div key={s.label} className="p-2 rounded-lg bg-muted/50 text-center">
                            <p className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</p>
                            <p className="text-[10px] text-muted-foreground">{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Success rate bar */}
                      {successRate !== null && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">Success rate</span>
                            <span className={`font-medium ${successRate >= 90 ? 'text-green-600' : successRate >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                              {successRate}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                successRate >= 90 ? 'bg-green-500' :
                                successRate >= 70 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${successRate}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Last error */}
                      {health?.lastError && (
                        <div className="p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                          <p className="text-[10px] text-red-600 dark:text-red-400 truncate">
                            Last error: {health.lastError}
                          </p>
                        </div>
                      )}

                      {/* Last checked */}
                      {health?.lastChecked && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          Last checked {timeAgo(health.lastChecked)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        )}

      </div>
    </div>
  )
}
