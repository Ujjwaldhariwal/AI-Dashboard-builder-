'use client'

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  WifiOff,
  RefreshCw,
  Trash2,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Server,
  AlertOctagon,
  Info,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useMonitoringStore, type LogLevel, type EndpointHealth } from "@/store/monitoring-store"
import { useDashboardStore } from "@/store/builder-store"
import { useRouter } from "next/navigation"
import {
  StatusIcon,
  TrendIcon,
  LatencyBadge,
  ErrorBadge,
  type StatusLevel,
  type TrendDirection,
} from "@/components/ui/status-icon"

type SortColumn = "endpoint" | "status" | "latency" | "errors" | "lastChecked"
type SortDirection = "asc" | "desc"

const STATUS_SORT_ORDER: Record<StatusLevel, number> = {
  down: 0,
  degraded: 1,
  unknown: 2,
  healthy: 3,
}

type InsightSeverity = "critical" | "warning" | "info" | "success"

interface InsightItem {
  id: string
  severity: InsightSeverity
  headline: string
  detail: string
  endpointName?: string
}

function formatRelativeTime(date: Date | string | number | null | undefined, now: Date): string {
  if (!date) return "never"
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return "unknown"
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 10) return "just now"
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function deriveTrend(health: EndpointHealth): TrendDirection {
  if (health.status === "down") return "worsening"
  if (health.status === "degraded") return "worsening"
  if (health.status === "healthy" && (health.errorCount ?? 0) === 0) return "stable"
  return "stable"
}

function generateInsights(endpointHealth: Record<string, EndpointHealth>): InsightItem[] {
  const entries = Object.values(endpointHealth)

  if (entries.length === 0) {
    return [
      {
        id: "no-endpoints",
        severity: "info",
        headline: "No endpoints configured",
        detail: "Add API endpoints to start monitoring health and latency.",
      },
    ]
  }

  const insights: InsightItem[] = []

  for (const ep of entries) {
    if (ep.status === "down") {
      insights.push({
        id: `down-${ep.endpointId}`,
        severity: "critical",
        headline: `${ep.endpointName} is down`,
        detail: `${ep.errorCount ?? 0} error${(ep.errorCount ?? 0) !== 1 ? "s" : ""} recorded. Last error: ${ep.lastError ?? "unknown"}.`,
        endpointName: ep.endpointName,
      })
    } else if (ep.status === "degraded") {
      insights.push({
        id: `degraded-${ep.endpointId}`,
        severity: "warning",
        headline: `${ep.endpointName} is degraded`,
        detail: `Latency elevated${ep.latencyMs != null ? ` at ${ep.latencyMs} ms` : ""}. Monitor for recovery.`,
        endpointName: ep.endpointName,
      })
    } else if (ep.latencyMs != null && ep.latencyMs > 500) {
      insights.push({
        id: `slow-${ep.endpointId}`,
        severity: "warning",
        headline: `${ep.endpointName} is slow`,
        detail: `Averaging ${ep.latencyMs} ms — above the 500 ms threshold.`,
        endpointName: ep.endpointName,
      })
    } else if ((ep.errorCount ?? 0) > 5) {
      insights.push({
        id: `errors-${ep.endpointId}`,
        severity: "warning",
        headline: `${ep.endpointName} has elevated errors`,
        detail: `${ep.errorCount} recent errors detected. Review logs for patterns.`,
        endpointName: ep.endpointName,
      })
    }
  }

  const seen = new Set<string>()
  const deduplicated = insights.filter((ins) => {
    const key = ins.endpointName ?? ins.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const allHealthy = entries.every((ep) => ep.status === "healthy")
  if (allHealthy) {
    deduplicated.push({
      id: "all-healthy",
      severity: "success",
      headline: `All ${entries.length} endpoints healthy`,
      detail: "No issues detected. Monitoring continues at scheduled intervals.",
    })
  }

  const SEVERITY_ORDER: Record<InsightSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  }
  deduplicated.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return deduplicated.slice(0, 6)
}

const levelBadge: Record<LogLevel, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
}

export default function MonitoringPage() {
  const router = useRouter()
  const { logs, endpointHealth, clearLogs, getErrorCount } = useMonitoringStore()
  const { endpoints } = useDashboardStore()

  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "health">("overview")
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const [sortCol, setSortCol] = useState<SortColumn>("status")
  const [sortDir, setSortDir] = useState<SortDirection>("asc")

  const handleSort = useCallback((col: SortColumn) => {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
        return col
      }
      setSortDir("asc")
      return col
    })
  }, [])

  const healthByEndpoint = useMemo(() => {
    const merged: Record<string, EndpointHealth> = { ...endpointHealth }
    for (const endpoint of endpoints) {
      if (!merged[endpoint.id]) {
        merged[endpoint.id] = {
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          url: endpoint.url,
          status: "unknown",
          lastChecked: "",
          successCount: 0,
          errorCount: 0,
        }
      }
    }
    return merged
  }, [endpointHealth, endpoints])

  const sortedHealth = useMemo(() => {
    const entries = Object.values(healthByEndpoint)
    return [...entries].sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case "endpoint":
          cmp = a.endpointName.localeCompare(b.endpointName)
          break
        case "status":
          cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]
          break
        case "latency":
          cmp = (a.latencyMs ?? Number.POSITIVE_INFINITY) - (b.latencyMs ?? Number.POSITIVE_INFINITY)
          break
        case "errors":
          cmp = (a.errorCount ?? 0) - (b.errorCount ?? 0)
          break
        case "lastChecked":
          cmp =
            new Date(a.lastChecked ?? 0).getTime() -
            new Date(b.lastChecked ?? 0).getTime()
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [healthByEndpoint, sortCol, sortDir])

  const insights = useMemo(() => generateInsights(healthByEndpoint), [healthByEndpoint])

  const errorCount = getErrorCount()
  const warnCount = logs.filter((l) => l.level === "warn").length
  const avgLatency = logs.filter((l) => l.latencyMs != null).length
    ? Math.round(
        logs.filter((l) => l.latencyMs != null).reduce((s, l) => s + (l.latencyMs ?? 0), 0) /
        logs.filter((l) => l.latencyMs != null).length,
      )
    : 0

  const healthyCount = sortedHealth.filter((h) => h.status === "healthy").length
  const downCount = sortedHealth.filter((h) => h.status === "down").length
  const degradedCount = sortedHealth.filter((h) => h.status === "degraded").length

  const filteredLogs = logs.filter((l) => {
    const matchLevel = levelFilter === "all" || l.level === levelFilter
    const matchSearch = !search ||
      l.widgetTitle.toLowerCase().includes(search.toLowerCase()) ||
      l.message.toLowerCase().includes(search.toLowerCase()) ||
      l.endpointUrl.toLowerCase().includes(search.toLowerCase())
    return matchLevel && matchSearch
  })

  const renderKpiTrend = (delta: number, upIsGood: boolean) => {
    if (delta === 0) return null
    const isUp = delta > 0
    const isGood = isUp ? upIsGood : !upIsGood
    return (
      <span
        className={cn(
          "inline-flex items-center text-xs",
          isGood ? "text-emerald-500" : "text-red-500",
        )}
      >
        {isUp
          ? <ArrowUp className="h-3 w-3" aria-label="increased" />
          : <ArrowDown className="h-3 w-3" aria-label="decreased" />}
      </span>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Go back"
              onClick={() => router.back()}
              className="h-9 w-9 rounded-xl border hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">Monitoring</h1>
                {errorCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {errorCount} error{errorCount !== 1 ? "s" : ""}
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border border-border/60 shadow-none">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Total Logs</p>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <p className="text-2xl font-bold tabular-nums">{logs.length}</p>
                {renderKpiTrend(logs.length > 0 ? 1 : 0, true)}
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border/60 shadow-none">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Errors</p>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-2xl font-bold tabular-nums">{errorCount}</p>
                {renderKpiTrend(errorCount > 0 ? 1 : -1, false)}
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border/60 shadow-none">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Avg Latency</p>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-2xl font-bold tabular-nums">{avgLatency} ms</p>
                {renderKpiTrend(avgLatency > 500 ? 1 : avgLatency > 0 ? -1 : 0, false)}
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border/60 shadow-none">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Healthy APIs</p>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <p className="text-2xl font-bold tabular-nums">{healthyCount}/{sortedHealth.length}</p>
                {renderKpiTrend(
                  sortedHealth.length === 0 ? 0 : healthyCount === sortedHealth.length ? 1 : -1,
                  true,
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex border-b gap-1">
          {([
            { key: "overview", label: "Overview" },
            { key: "logs", label: `Logs (${logs.length})` },
            { key: "health", label: `API Health (${sortedHealth.length})` },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="grid md:grid-cols-2 gap-5">
            <Card className="border border-border/60 shadow-none">
              <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusIcon status="healthy" size="sm" aria-label="Healthy endpoints" />
                  <span>{healthyCount} healthy</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusIcon status="degraded" size="sm" aria-label="Degraded endpoints" />
                  <span>{degradedCount} degraded</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusIcon status="down" size="sm" aria-label="Down endpoints" />
                  <span>{downCount} down</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{warnCount} warning log{warnCount === 1 ? "" : "s"}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/60 shadow-none">
              <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {logs.slice(0, 6).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No activity yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {logs.slice(0, 6).map((log) => (
                      <div key={log.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${levelBadge[log.level]}`}>
                          {log.level}
                        </span>
                        <span className="text-xs font-medium truncate flex-shrink-0 w-28">{log.widgetTitle}</span>
                        <span className="text-[11px] text-muted-foreground truncate flex-1">{log.message}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                          {formatRelativeTime(log.timestamp, now)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border border-border/60 shadow-none">
              <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-sm font-medium text-foreground">Insights</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {insights.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No monitoring data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {insights.map((insight) => {
                      const { dotColor, Icon, iconColor } = {
                        critical: {
                          dotColor: "bg-red-500",
                          Icon: AlertOctagon,
                          iconColor: "text-red-500 dark:text-red-400",
                        },
                        warning: {
                          dotColor: "bg-amber-500",
                          Icon: AlertTriangle,
                          iconColor: "text-amber-500 dark:text-amber-400",
                        },
                        info: {
                          dotColor: "bg-blue-500",
                          Icon: Info,
                          iconColor: "text-blue-500 dark:text-blue-400",
                        },
                        success: {
                          dotColor: "bg-emerald-500",
                          Icon: CheckCircle2,
                          iconColor: "text-emerald-500 dark:text-emerald-400",
                        },
                      }[insight.severity]

                      return (
                        <div
                          key={insight.id}
                          className="flex items-stretch gap-3 rounded-lg border border-border/60 bg-card overflow-hidden"
                        >
                          <div
                            className={cn("w-1 self-stretch rounded-full shrink-0 my-2 ml-2", dotColor)}
                          />
                          <div className="flex items-start gap-2 py-3 pr-3 flex-1 min-w-0">
                            <Icon
                              className={cn("h-4 w-4 mt-0.5 shrink-0", iconColor)}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-snug">{insight.headline}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                {insight.detail}
                              </p>
                              {insight.endpointName && (
                                <span className="inline-block mt-1.5 font-mono text-[11px] bg-muted/60 rounded px-1.5 py-0.5">
                                  {insight.endpointName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Input
                  placeholder="Search widget, message, URL..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {["all", "success", "warn", "error", "info"].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLevelFilter(lvl)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium ${
                      levelFilter === lvl
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {lvl === "all" ? `All (${logs.length})` : `${lvl} (${logs.filter((l) => l.level === lvl).length})`}
                  </button>
                ))}
              </div>
            </div>

            <Card className="border border-border/60 shadow-none">
              <CardContent className="p-0">
                {filteredLogs.length === 0 ? (
                  <div className="py-16 text-center">
                    <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {logs.length === 0 ? "No logs yet — open builder to generate activity" : "No logs match your filter"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          {["Level", "Widget", "Message", "Latency", "Status", "Time"].map((h) => (
                            <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.map((log) => (
                          <tr
                            key={log.id}
                            className="border-b border-border/40 hover:bg-muted/40 transition-colors"
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
                              <LatencyBadge latencyMs={log.latencyMs} />
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">
                              {log.statusCode ? `HTTP ${log.statusCode}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                              {formatRelativeTime(log.timestamp, now)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "health" && (
          <div className="space-y-4">
            <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    {(
                      [
                        { col: "endpoint" as SortColumn, label: "Endpoint" },
                        { col: "status" as SortColumn, label: "Status" },
                        { col: "latency" as SortColumn, label: "Latency" },
                        { col: "errors" as SortColumn, label: "Errors" },
                        { col: "lastChecked" as SortColumn, label: "Last Checked" },
                      ] as const
                    ).map(({ col, label }) => (
                      <th
                        key={col}
                        className="px-4 py-2.5 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                        onClick={() => handleSort(col)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {label}
                          {sortCol === col ? (
                            sortDir === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHealth.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Server className="h-8 w-8 text-muted-foreground/40" />
                          <p className="text-sm">No endpoints configured</p>
                          <p className="text-xs text-muted-foreground/60">Add endpoints to start monitoring</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedHealth.map((ep, i) => (
                      <tr
                        key={ep.endpointId}
                        className={cn(
                          "border-b border-border/40 transition-colors hover:bg-muted/40",
                          i % 2 === 0 ? "" : "bg-muted/20",
                        )}
                      >
                        <td className="px-4 py-3 max-w-[220px]">
                          <span
                            className="font-mono text-xs truncate block"
                            title={ep.url ?? ep.endpointName}
                          >
                            {ep.endpointName}
                          </span>
                          {ep.url && (
                            <span className="text-[11px] text-muted-foreground truncate block">
                              {ep.url}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <StatusIcon
                              status={ep.status}
                              size="sm"
                              aria-label={`Status: ${ep.status}`}
                            />
                            <span className="text-xs capitalize">{ep.status}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <LatencyBadge latencyMs={ep.latencyMs} />
                        </td>
                        <td className="px-4 py-3">
                          <ErrorBadge count={ep.errorCount ?? 0} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {formatRelativeTime(ep.lastChecked, now)}
                        </td>
                        <td className="px-4 py-3">
                          <TrendIcon
                            trend={deriveTrend(ep)}
                            size="sm"
                            aria-label={`Trend: ${deriveTrend(ep)}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-2">
              {sortedHealth.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Server className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm">No endpoints configured</p>
                </div>
              ) : (
                sortedHealth.map((ep) => (
                  <div
                    key={ep.endpointId}
                    className="rounded-lg border border-border/60 bg-card p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium truncate">
                        {ep.endpointName}
                      </span>
                      <span className="inline-flex items-center gap-1.5 shrink-0">
                        <StatusIcon
                          status={ep.status}
                          size="sm"
                          aria-label={`Status: ${ep.status}`}
                        />
                        <span className="text-xs capitalize">{ep.status}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <LatencyBadge latencyMs={ep.latencyMs} />
                      <ErrorBadge count={ep.errorCount ?? 0} />
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(ep.lastChecked, now)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
