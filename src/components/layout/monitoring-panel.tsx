'use client'

// src/components/layout/monitoring-panel.tsx

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Activity, CheckCircle2, AlertTriangle,
  XCircle, Clock, Wifi, RefreshCw, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMonitoringStore, type LogLevel } from '@/store/monitoring-store'
import { useDashboardStore } from '@/store/builder-store'
import { StatusIcon, LatencyBadge, ErrorBadge } from '@/components/ui/status-icon'

interface MonitoringPanelProps {
  onClose: () => void
}

const levelIcon = {
  success: <CheckCircle2 className="w-3 h-3 text-green-500" />,
  info:    <Activity className="w-3 h-3 text-blue-500" />,
  warn:    <AlertTriangle className="w-3 h-3 text-amber-500" />,
  error:   <XCircle className="w-3 h-3 text-red-500" />,
}

const levelBg = {
  success: 'border-green-100 dark:border-green-900/40',
  info:    'border-blue-100 dark:border-blue-900/40',
  warn:    'border-amber-100 dark:border-amber-900/40',
  error:   'border-red-100 dark:border-red-900/40',
}

export function MonitoringPanel({ onClose }: MonitoringPanelProps) {
  const { logs, endpointHealth, clearLogs, getErrorCount } = useMonitoringStore()
  const { endpoints } = useDashboardStore()
  const [tab, setTab] = useState<'logs' | 'health'>('logs')
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all')

  const filteredLogs = levelFilter === 'all'
    ? logs
    : logs.filter(l => l.level === levelFilter)

  const errorCount = getErrorCount()

  const healthList = endpoints.map(e => ({
    endpoint: e,
    health:   endpointHealth[e.id],
  }))

  return (
    <div className="flex flex-col h-full bg-card">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold">Monitoring</span>
          {errorCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 h-4">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearLogs} title="Clear logs" aria-label="Clear logs">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close monitoring panel">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b flex-shrink-0">
        {(['logs', 'health'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'logs' ? `Logs (${logs.length})` : `API Health (${endpoints.length})`}
          </button>
        ))}
      </div>

      {/* ── Logs tab ──────────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <>
          {/* Level filter */}
          <div className="flex gap-1.5 px-3 py-2 border-b flex-shrink-0 flex-wrap">
            {(['all', 'success', 'info', 'warn', 'error'] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  levelFilter === lvl
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-muted border-border text-muted-foreground'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Activity className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">
                  {logs.length === 0 ? 'No activity yet' : 'No logs match filter'}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredLogs.map(log => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-2.5 rounded-lg border text-[11px] space-y-0.5 ${levelBg[log.level]}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {levelIcon[log.level]}
                      <span className="font-medium truncate flex-1">{log.widgetTitle}</span>
                      {log.latencyMs !== undefined && (
                        <span className={`font-mono flex-shrink-0 ${
                          log.latencyMs > 2000 ? 'text-amber-500' : 'text-muted-foreground'
                        }`}>
                          {log.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground leading-snug">{log.message}</p>
                    <div className="flex items-center gap-1 text-muted-foreground/70">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      {log.statusCode && (
                        <span className="ml-1 font-mono">HTTP {log.statusCode}</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {/* ── Health tab ────────────────────────────────────────────────────── */}
      {tab === 'health' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {healthList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Wifi className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No APIs connected yet</p>
            </div>
          ) : (
            healthList.map(({ endpoint, health }) => {
              const status = health?.status ?? 'unknown'

              return (
                <div key={endpoint.id} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIcon
                        status={status}
                        size="sm"
                        aria-label={`${endpoint.name}: ${status}`}
                      />
                      <p className="text-xs font-semibold truncate">{endpoint.name}</p>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted/40 text-muted-foreground capitalize">
                      {status}
                    </span>
                  </div>

                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {endpoint.url}
                  </p>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <LatencyBadge latencyMs={health?.latencyMs} />
                    <ErrorBadge count={health?.errorCount ?? 0} />
                    {health && (
                      <>
                        <span className="text-muted-foreground tabular-nums">{health.successCount} ok</span>
                      </>
                    )}
                    {health?.lastChecked && (
                      <span className="flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5" />
                        {new Date(health.lastChecked).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {health?.lastError && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      Last error: {health.lastError}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
