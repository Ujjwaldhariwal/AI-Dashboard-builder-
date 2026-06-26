'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Eye, FileStack, LayoutDashboard, Loader2, Plus, Rocket, Send, SquareStack, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { DashboardChartSlot, DashboardHealthAudit, DashboardPage, DashboardVersion, PublishedDashboard } from '@/types/dashboard-publishing'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
}

interface VersionHistory {
  versions: DashboardVersion[]
  pages: DashboardPage[]
  slots: DashboardChartSlot[]
}

function errorToText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return 'Request failed'
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function statusClassName(status: string) {
  if (status === 'published') return 'border-[#a6e22e]/30 bg-[#a6e22e]/10 text-[#d7ff8f]'
  if (status === 'archived' || status === 'retired') return 'border-[#f92672]/30 bg-[#f92672]/10 text-[#ff8db9]'
  return 'border-[#66d9ef]/30 bg-[#66d9ef]/10 text-[#9beeff]'
}

function chartSize(chart: DashboardChartConfig) {
  if (chart.presentation.size === 'full' || chart.layout.gridSpan >= 4) return { width: 12, height: 5 }
  if (chart.presentation.size === 'wide' || chart.layout.gridSpan >= 3) return { width: 8, height: 4 }
  if (chart.presentation.size === 'compact') return { width: 4, height: 3 }
  return { width: 6, height: 4 }
}

export function PublishedDashboardsAdminPanel() {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [dashboards, setDashboards] = useState<PublishedDashboard[]>([])
  const [charts, setCharts] = useState<DashboardChartConfig[]>([])
  const [history, setHistory] = useState<VersionHistory>({ versions: [], pages: [], slots: [] })
  const [projectId, setProjectId] = useState('')
  const [dashboardId, setDashboardId] = useState('')
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([])
  const [dashboardName, setDashboardName] = useState('')
  const [dashboardDescription, setDashboardDescription] = useState('')
  const [versionTitle, setVersionTitle] = useState('')
  const [versionNotes, setVersionNotes] = useState('')
  const [savingDashboard, setSavingDashboard] = useState(false)
  const [savingVersion, setSavingVersion] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [healthAudit, setHealthAudit] = useState<DashboardHealthAudit | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  const selectedProject = projects.find(project => project.id === projectId)
  const selectedDashboard = dashboards.find(dashboard => dashboard.id === dashboardId)
  const publishableCharts = useMemo(() => charts.filter(chart => (
    chart.status === 'published' && ['valid', 'warning'].includes(chart.validationState)
  )), [charts])
  const selectedCharts = useMemo(() => {
    const selected = new Set(selectedChartIds)
    return publishableCharts.filter(chart => selected.has(chart.id))
  }, [publishableCharts, selectedChartIds])
  const pagesByVersion = useMemo(() => {
    const map = new Map<string, DashboardPage[]>()
    for (const page of history.pages) map.set(page.versionId, [...(map.get(page.versionId) ?? []), page])
    return map
  }, [history.pages])
  const slotsByVersion = useMemo(() => {
    const map = new Map<string, DashboardChartSlot[]>()
    for (const slot of history.slots) map.set(slot.versionId, [...(map.get(slot.versionId) ?? []), slot])
    return map
  }, [history.slots])

  const fetchProjects = useCallback(async () => {
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    setProjectId(current => current || nextProjects[0]?.id || '')
  }, [])

  const fetchProjectAssets = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId) return
    const [dashboardsResponse, chartsResponse] = await Promise.all([
      fetch(`/api/admin/published-dashboards?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/dashboard-charts?projectId=${nextProjectId}`, { cache: 'no-store' }),
    ])
    const dashboardsPayload = await dashboardsResponse.json().catch(() => null)
    const chartsPayload = await chartsResponse.json().catch(() => null)
    if (!dashboardsResponse.ok) throw new Error(errorToText(dashboardsPayload))
    if (!chartsResponse.ok) throw new Error(errorToText(chartsPayload))
    const nextDashboards = Array.isArray(dashboardsPayload?.dashboards) ? dashboardsPayload.dashboards as PublishedDashboard[] : []
    const nextCharts = Array.isArray(chartsPayload?.charts) ? chartsPayload.charts as DashboardChartConfig[] : []
    setDashboards(nextDashboards)
    setCharts(nextCharts)
    setDashboardId(current => nextDashboards.some(dashboard => dashboard.id === current) ? current : nextDashboards[0]?.id ?? '')
    setSelectedChartIds(current => current.filter(chartId => nextCharts.some(chart => chart.id === chartId)))
  }, [])

  const fetchVersionHistory = useCallback(async (nextDashboardId: string) => {
    if (!nextDashboardId) {
      setHistory({ versions: [], pages: [], slots: [] })
      return
    }
    const response = await fetch(`/api/admin/published-dashboards/${nextDashboardId}/versions`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    setHistory({
      versions: Array.isArray(payload?.versions) ? payload.versions as DashboardVersion[] : [],
      pages: Array.isArray(payload?.pages) ? payload.pages as DashboardPage[] : [],
      slots: Array.isArray(payload?.slots) ? payload.slots as DashboardChartSlot[] : [],
    })
  }, [])

  useEffect(() => {
    void fetchProjects().catch(error => toast.error(errorToText(error))).finally(() => setLoading(false))
  }, [fetchProjects])

  useEffect(() => {
    if (!projectId) return
    void fetchProjectAssets(projectId).catch(error => toast.error(errorToText(error)))
  }, [fetchProjectAssets, projectId])

  useEffect(() => {
    if (!dashboardId) {
      setHistory({ versions: [], pages: [], slots: [] })
      return
    }
    void fetchVersionHistory(dashboardId).catch(error => toast.error(errorToText(error)))
  }, [dashboardId, fetchVersionHistory])

  async function createDashboard() {
    if (!selectedProject) return
    setSavingDashboard(true)
    try {
      const response = await fetch('/api/admin/published-dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          name: dashboardName.trim(),
          slug: slugify(dashboardName),
          description: dashboardDescription.trim(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      toast.success('Dashboard shell created')
      setDashboardName('')
      setDashboardDescription('')
      await fetchProjectAssets(selectedProject.id)
      if (payload?.dashboard?.id) setDashboardId(String(payload.dashboard.id))
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setSavingDashboard(false)
    }
  }

  async function createVersion() {
    if (!selectedDashboard || selectedCharts.length === 0) return
    setSavingVersion(true)
    try {
      const response = await fetch(`/api/admin/published-dashboards/${selectedDashboard.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: versionTitle.trim() || `${selectedDashboard.name} release`,
          notes: versionNotes.trim(),
          layout: { mode: 'responsive-grid' },
          pages: [{
            title: 'Overview',
            slug: 'overview',
            sortOrder: 0,
            layout: { columns: 12 },
            slots: selectedCharts.map((chart, index) => {
              const size = chartSize(chart)
              return {
                chartConfigId: chart.id,
                title: chart.name,
                slotKey: slugify(chart.name) || `slot-${index + 1}`,
                rowIndex: Math.floor(index / 2),
                columnIndex: index % 2 === 0 ? 0 : 6,
                width: size.width,
                height: size.height,
                settings: {},
              }
            }),
          }],
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      toast.success('Draft version created')
      setVersionTitle('')
      setVersionNotes('')
      setSelectedChartIds([])
      await fetchVersionHistory(selectedDashboard.id)
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setSavingVersion(false)
    }
  }

  async function publishVersion(versionId: string) {
    if (!selectedDashboard) return
    setPublishingId(versionId)
    try {
      const response = await fetch(`/api/admin/published-dashboards/${selectedDashboard.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, notes: 'Published from admin publishing panel' }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      toast.success('Dashboard version published')
      await Promise.all([
        fetchProjectAssets(projectId),
        fetchVersionHistory(selectedDashboard.id),
      ])
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setPublishingId(null)
    }
  }

  async function runDashboardHealthCheck() {
    if (!projectId) return
    setHealthLoading(true)
    try {
      const response = await fetch(`/api/admin/published-dashboards/health?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setHealthAudit(payload?.audit as DashboardHealthAudit)
      toast.success('Dashboard health check recorded')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setHealthLoading(false)
    }
  }

  function toggleChart(chartId: string) {
    setSelectedChartIds(current => (
      current.includes(chartId)
        ? current.filter(id => id !== chartId)
        : [...current, chartId]
    ))
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading publishing workspace
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[#a6e22e] text-[#1f1f1c] hover:bg-[#a6e22e]">Publishing</Badge>
            <Badge variant="outline" className="border-white/15 text-slate-300">Versioned dashboard runtime</Badge>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Published dashboards</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Compose client-visible dashboard releases from governed chart configs. Legacy widgets stay out of this flow.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Label className="text-xs text-slate-400">Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="mt-2 border-white/10 bg-slate-950 text-slate-100">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(project => (
                <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={runDashboardHealthCheck} disabled={!projectId || healthLoading} className="bg-[#f92672] text-white hover:bg-[#ff5c9c]">
          {healthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
          Run health check
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Dashboards</p>
            <p className="mt-2 text-2xl font-semibold">{dashboards.length}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Versions</p>
            <p className="mt-2 text-2xl font-semibold">{history.versions.length}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Eligible charts</p>
            <p className="mt-2 text-2xl font-semibold">{publishableCharts.length}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Selected slots</p>
            <p className="mt-2 text-2xl font-semibold">{selectedCharts.length}</p>
          </CardContent>
        </Card>
      </section>

      {healthAudit ? (
        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Dashboard health</h3>
              <p className="mt-1 text-xs text-slate-500">
                Checked {new Date(healthAudit.checkedAt).toLocaleString()} across {healthAudit.summary.total} published dashboards.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-[#a6e22e]/30 bg-[#a6e22e]/10 text-[#d7ff8f]">{healthAudit.summary.healthy} healthy</Badge>
              <Badge variant="outline" className="border-[#fd971f]/30 bg-[#fd971f]/10 text-[#ffd866]">{healthAudit.summary.stale} stale</Badge>
              <Badge variant="outline" className="border-[#f92672]/30 bg-[#f92672]/10 text-[#ff8db9]">{healthAudit.summary.blocked} blocked</Badge>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="space-y-5">
          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <LayoutDashboard className="h-4 w-4 text-[#a6e22e]" />
                New dashboard shell
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-400">Name</Label>
                <Input value={dashboardName} onChange={event => setDashboardName(event.target.value)} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Executive revenue" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Description</Label>
                <Textarea value={dashboardDescription} onChange={event => setDashboardDescription(event.target.value)} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Read-only client dashboard purpose" />
              </div>
              <Button onClick={createDashboard} disabled={!selectedProject || dashboardName.trim().length < 2 || savingDashboard} className="w-full bg-[#a6e22e] text-[#1f1f1c] hover:bg-[#cfff55]">
                {savingDashboard ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create dashboard
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <SquareStack className="h-4 w-4 text-[#66d9ef]" />
                Dashboard selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={dashboardId} onValueChange={setDashboardId}>
                <SelectTrigger className="border-white/10 bg-slate-950 text-slate-100">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {dashboards.map(dashboard => (
                    <SelectItem key={dashboard.id} value={dashboard.id}>{dashboard.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDashboard ? (
                <div className="rounded-md border border-white/10 bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{selectedDashboard.name}</p>
                      <p className="mt-1 text-xs text-slate-500">/{selectedDashboard.slug}</p>
                    </div>
                    <Badge variant="outline" className={statusClassName(selectedDashboard.status)}>{selectedDashboard.status}</Badge>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                  Create a dashboard shell to start versioning.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileStack className="h-4 w-4 text-[#fd971f]" />
                Draft version composer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-slate-400">Version title</Label>
                  <Input value={versionTitle} onChange={event => setVersionTitle(event.target.value)} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Q2 executive release" />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Release notes</Label>
                  <Input value={versionNotes} onChange={event => setVersionNotes(event.target.value)} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Initial client release" />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {publishableCharts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-slate-500 lg:col-span-2">
                    Publish and validate chart configs before composing a dashboard version.
                  </div>
                ) : publishableCharts.map(chart => {
                  const selected = selectedChartIds.includes(chart.id)
                  return (
                    <button
                      key={chart.id}
                      type="button"
                      onClick={() => toggleChart(chart.id)}
                      className={[
                        'min-h-24 rounded-md border p-3 text-left transition-colors',
                        selected
                          ? 'border-[#a6e22e]/50 bg-[#a6e22e]/10'
                          : 'border-white/10 bg-slate-950/50 hover:border-white/25',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{chart.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{chart.templateId}</p>
                        </div>
                        {selected ? <CheckCircle2 className="h-4 w-4 text-[#a6e22e]" /> : <Eye className="h-4 w-4 text-slate-500" />}
                      </div>
                    </button>
                  )
                })}
              </div>

              <Button onClick={createVersion} disabled={!selectedDashboard || selectedCharts.length === 0 || savingVersion} className="bg-[#66d9ef] text-slate-950 hover:bg-[#9beeff]">
                {savingVersion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Create draft version
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Rocket className="h-4 w-4 text-[#f92672]" />
                Version history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.versions.length === 0 ? (
                <div className="flex gap-2 rounded-md border border-dashed border-white/10 p-4 text-xs text-slate-500">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  No versions have been created for this dashboard.
                </div>
              ) : history.versions.map(version => {
                const pageCount = pagesByVersion.get(version.id)?.length ?? 0
                const slotCount = slotsByVersion.get(version.id)?.length ?? 0
                const publishDisabled = version.status === 'published' || slotCount === 0 || pageCount === 0
                return (
                  <div key={version.id} className="rounded-md border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{version.title}</p>
                          <Badge variant="outline" className={statusClassName(version.status)}>{version.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Version {version.versionNumber} · {pageCount} pages · {slotCount} slots
                        </p>
                      </div>
                      <Button size="sm" onClick={() => publishVersion(version.id)} disabled={publishDisabled || publishingId === version.id} className="bg-[#f92672] text-white hover:bg-[#ff5c9c]">
                        {publishingId === version.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                        Publish
                      </Button>
                    </div>
                    {version.publishedAt ? (
                      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        Published {new Date(version.publishedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
