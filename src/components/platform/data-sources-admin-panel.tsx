'use client'

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, BrainCircuit, Clock3, Database, FileSearch, KeyRound, Loader2, PlugZap, Plus, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import { demoColumns, demoDataSource, demoProjects, DEMO_DATA_SOURCE_ID, DEMO_PROJECT_ID, DEMO_TENANT_ID } from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import { buildGuidedSchemaProfile } from '@/lib/dashboardos/guided-review'
import type { DataSource, DataSourceSchemaProfileSummary, DataSourceSslMode } from '@/types/data-source'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
  tenantSlug?: string | null
}

const REQUIREMENTS = [
  'Postgres-only for v1',
  'Read-only database users',
  'Encrypted credentials at rest',
  'Server-side connection testing',
  'Schema introspection before datasets',
  'Timeouts, row limits, and audit logs',
]

const SCAN_TO_CHART_FLOW = [
  {
    title: '1. Connect',
    body: 'Save one read-only Postgres connection under a tenant project.',
  },
  {
    title: '2. Scan',
    body: 'Run schema introspection to import schemas, tables, columns, data types, and scan completeness.',
  },
  {
    title: '3. Map',
    body: 'Open Semantic Model and turn raw columns into business fields, metrics, and joins.',
  },
  {
    title: '4. Package',
    body: 'Create a Dataset from approved semantic fields and metrics; this becomes the chart contract.',
  },
  {
    title: '5. Chart',
    body: 'Choose a compatible chart template, bind axes and metrics, validate, then publish.',
  },
]

function errorToText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return 'Request failed'
}

export function DataSourcesAdminPanel() {
  const builderScope = useScopedBuilderStore(state => state.scope)
  const setBuilderScope = useScopedBuilderStore(state => state.setScope)
  const addBuilderDataSourceId = useScopedBuilderStore(state => state.addDataSourceId)
  const removeBuilderDataSourceId = useScopedBuilderStore(state => state.removeDataSourceId)
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [schemaProfiles, setSchemaProfiles] = useState<Record<string, DataSourceSchemaProfileSummary>>({})
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busySourceId, setBusySourceId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'test' | 'introspect' | 'refresh' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('5432')
  const [database, setDatabase] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sslMode, setSslMode] = useState<DataSourceSslMode>('require')
  const [schemas, setSchemas] = useState('public')
  const [clientReady, setClientReady] = useState(false)
  const demoMode = isDashboardOsDemoMode()
  const guidedProfile = useMemo(() => (
    clientReady && demoMode ? buildGuidedSchemaProfile(demoColumns) : null
  ), [clientReady, demoMode])

  const fetchDataSources = async (nextProjectId = projectId) => {
    setLoading(true)
    setError(null)
    try {
      if (demoMode) {
        setDataSources(nextProjectId ? [demoDataSource] : [demoDataSource])
        if (!builderScope || builderScope.tenantId !== DEMO_TENANT_ID || builderScope.projectId !== DEMO_PROJECT_ID) {
          setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'data_source')
        }
        addBuilderDataSourceId(DEMO_DATA_SOURCE_ID)
        return
      }
      const query = nextProjectId ? `?projectId=${encodeURIComponent(nextProjectId)}` : ''
      const response = await fetch(`/api/admin/data-sources${query}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Request failed (${response.status})`)
      setDataSources(Array.isArray(payload?.dataSources) ? payload.dataSources : [])
      const profileQuery = nextProjectId ? `?projectId=${encodeURIComponent(nextProjectId)}` : ''
      const profileResponse = await fetch(`/api/admin/schema-profiles${profileQuery}`, { cache: 'no-store' })
      const profilePayload = await profileResponse.json().catch(() => null)
      if (profileResponse.ok && Array.isArray(profilePayload?.profiles)) {
        setSchemaProfiles(Object.fromEntries(
          (profilePayload.profiles as DataSourceSchemaProfileSummary[]).map(profile => [profile.dataSourceId, profile]),
        ))
      } else {
        setSchemaProfiles({})
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    setProjectsLoading(true)
    try {
      if (demoMode) {
        setProjects(demoProjects)
        setProjectId(DEMO_PROJECT_ID)
        if (!builderScope || builderScope.tenantId !== DEMO_TENANT_ID || builderScope.projectId !== DEMO_PROJECT_ID) {
          setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'data_source')
        }
        return
      }
      const response = await fetch('/api/admin/projects', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Projects failed (${response.status})`)
      const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
      setProjects(nextProjects)
      if (builderScope && nextProjects.some(project => project.id === builderScope.projectId)) {
        setProjectId(builderScope.projectId)
      }
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : String(fetchError))
    } finally {
      setProjectsLoading(false)
    }
  }

  useEffect(() => {
    setClientReady(true)
    void fetchProjects()
  }, [])

  useEffect(() => {
    void fetchDataSources(projectId)
  }, [projectId])

  const resetForm = () => {
    setProjectId('')
    setName('')
    setHost('')
    setPort('5432')
    setDatabase('')
    setUsername('')
    setPassword('')
    setSslMode('require')
    setSchemas('public')
  }

  const handleCreate = async () => {
    const selectedProject = projects.find(project => project.id === projectId)
    if (!selectedProject || !name.trim() || !host.trim() || !database.trim() || !username.trim() || !password) {
      toast.error('Fill all required Postgres connection fields')
      return
    }

    setSaving(true)
    try {
      if (demoMode) {
        setDataSources(current => [demoDataSource, ...current.filter(source => source.id !== demoDataSource.id)])
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'data_source')
        addBuilderDataSourceId(DEMO_DATA_SOURCE_ID)
        setCreateOpen(false)
        resetForm()
        toast.success('Demo source saved and 14 schema columns imported')
        return
      }
      const response = await fetch('/api/admin/data-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          name,
          host,
          port,
          database,
          username,
          password,
          sslMode,
          schemas: schemas.split(',').map(value => value.trim()).filter(Boolean),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Create failed (${response.status})`)

      if (payload?.dataSource) {
        const dataSource = payload.dataSource as DataSource
        setDataSources(current => [dataSource, ...current])
        setBuilderScope({ tenantId: dataSource.tenantId, projectId: dataSource.projectId }, 'data_source')
        addBuilderDataSourceId(dataSource.id)
        setCreateOpen(false)
        resetForm()

        const introspectResponse = await fetch(`/api/admin/data-sources/${dataSource.id}/introspect`, { method: 'POST' })
        const introspectPayload = await introspectResponse.json().catch(() => null)
        if (!introspectResponse.ok) {
          throw new Error(errorToText(introspectPayload) || `Introspection failed (${introspectResponse.status})`)
        }
        await fetchDataSources(dataSource.projectId)
        toast.success(`Data source saved and ${introspectPayload?.columnCount ?? 0} schema columns imported`)
        return
      }
      toast.success('Data source saved')
      setCreateOpen(false)
      resetForm()
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setSaving(false)
    }
  }

  const replaceSource = (nextSource: DataSource) => {
    setDataSources(current => current.map(source => (
      source.id === nextSource.id ? nextSource : source
    )))
  }

  const handleTest = async (sourceId: string) => {
    setBusySourceId(sourceId)
    setBusyAction('test')
    try {
      if (demoMode) {
        replaceSource({ ...demoDataSource, lastTestedAt: new Date().toISOString(), lastTestStatus: 'ok' })
        toast.success('Demo connection healthy in 42 ms')
        return
      }
      const response = await fetch(`/api/admin/data-sources/${sourceId}/test`, { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (payload?.dataSource) replaceSource(payload.dataSource as DataSource)
      if (!response.ok) throw new Error(errorToText(payload) || `Test failed (${response.status})`)
      toast.success(`Connection healthy in ${payload?.test?.latencyMs ?? 0} ms`)
    } catch (testError) {
      toast.error(testError instanceof Error ? testError.message : String(testError))
    } finally {
      setBusySourceId(null)
      setBusyAction(null)
    }
  }

  const handleIntrospect = async (sourceId: string) => {
    setBusySourceId(sourceId)
    setBusyAction('introspect')
    try {
      if (demoMode) {
        replaceSource({ ...demoDataSource, schemaLastIntrospectedAt: new Date().toISOString(), schemaLastStatus: 'ok' })
        addBuilderDataSourceId(sourceId)
        toast.success('Imported 14 columns from 3 demo tables')
        return
      }
      const response = await fetch(`/api/admin/data-sources/${sourceId}/introspect`, { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Introspection failed (${response.status})`)
      addBuilderDataSourceId(sourceId)
      await fetchDataSources(projectId)
      const tableCount = Number(payload?.tableCount ?? payload?.tables?.length ?? 0)
      toast.success(payload?.noOp
        ? `Schema unchanged: ${payload?.columnCount ?? 0} columns across ${tableCount} tables`
        : `Imported ${payload?.columnCount ?? 0} columns from ${tableCount} tables${payload?.profileSummary ? ' and prepared schema intelligence' : ''}`)
      if (Array.isArray(payload?.profilingWarnings) && payload.profilingWarnings.length > 0) {
        toast.warning(`Schema saved with ${payload.profilingWarnings.length} profiling warning(s)`)
      }
    } catch (introspectError) {
      toast.error(introspectError instanceof Error ? introspectError.message : String(introspectError))
    } finally {
      setBusySourceId(null)
      setBusyAction(null)
    }
  }

  const handleRequestRefresh = async (sourceId: string) => {
    setBusySourceId(sourceId)
    setBusyAction('refresh')
    try {
      if (demoMode) {
        replaceSource({ ...demoDataSource, schemaRefreshRequestedAt: new Date().toISOString(), schemaRefreshReason: 'admin_requested' })
        toast.success('Demo schema refresh requested')
        return
      }
      const response = await fetch(`/api/admin/data-sources/${sourceId}/schema-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'admin_requested' }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Refresh request failed (${response.status})`)
      await fetchDataSources(projectId)
      toast.success('Schema refresh requested')
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setBusySourceId(null)
      setBusyAction(null)
    }
  }

  const handleRemoveSource = async (source: DataSource) => {
    if (!window.confirm(`Remove "${source.name}" from this project? Schema metadata for this source will be removed too.`)) return

    setBusySourceId(source.id)
    setBusyAction('remove')
    try {
      if (demoMode) {
        setDataSources(current => current.filter(item => item.id !== source.id))
        removeBuilderDataSourceId(source.id)
        toast.success('Demo data source removed')
        return
      }
      const response = await fetch(`/api/admin/data-sources/${source.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Remove failed (${response.status})`)
      setDataSources(current => current.filter(item => item.id !== source.id))
      removeBuilderDataSourceId(source.id)
      toast.success('Data source removed')
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : String(removeError))
    } finally {
      setBusySourceId(null)
      setBusyAction(null)
    }
  }

  const schemaStatusLabel = (source: DataSource) => {
    if (source.schemaLastStatus === 'ok') return 'schema fresh'
    if (source.schemaLastStatus === 'error') return 'schema error'
    if (source.schemaLastStatus === 'pending_refresh') return 'refresh pending'
    return 'not scanned'
  }

  const schemaAgeLabel = (source: DataSource) => {
    if (!source.schemaLastIntrospectedAt) return 'never scanned'
    return new Date(source.schemaLastIntrospectedAt).toLocaleString()
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-[color:var(--dos-border-soft)] pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-[var(--dos-accent-primary)]">Connection inventory</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--dos-text-primary)]">Data source workbench</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--dos-text-muted)]">
            Connect least-privilege Postgres sources, verify access, and maintain the schema evidence used by semantic models.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--dos-text-muted)]">
          <span><strong className="font-mono text-[var(--dos-text-primary)]">{dataSources.length}</strong> sources</span>
          <span><strong className="font-mono text-[var(--dos-text-primary)]">{dataSources.reduce((total, source) => total + source.schemaTableCount, 0)}</strong> tables</span>
          <span><strong className="font-mono text-[var(--dos-text-primary)]">{dataSources.reduce((total, source) => total + source.schemaColumnCount, 0)}</strong> columns</span>
        </div>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0 border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-[color:var(--dos-border-soft)]">
            <div>
              <CardTitle className="text-base">Postgres sources</CardTitle>
              <p className="mt-1 text-xs text-[var(--dos-text-muted)]">Connection health, scan freshness, and profiling evidence.</p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={demoMode} title={demoMode ? 'Source creation is disabled in the prepared reference workspace' : undefined}>
              <Plus className="mr-2 h-4 w-4" />
              Add Source
            </Button>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {loading ? (
              <div className="flex items-center px-5 py-12 text-sm text-[var(--dos-text-muted)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading data sources
              </div>
            ) : error ? (
              <div className="m-5 rounded-md border border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] p-4 text-sm text-[var(--dos-warning-text)]">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Data-source API is not ready</p>
                    <p className="mt-1 text-xs leading-5 text-amber-100/75">{error}</p>
                    <p className="mt-2 text-xs text-amber-100/75">
                      Apply the tenancy/data-source migrations and configure DATA_SOURCE_ENCRYPTION_KEY.
                    </p>
                  </div>
                </div>
              </div>
            ) : dataSources.length > 0 ? (
              dataSources.map((source) => {
                const profile = schemaProfiles[source.id]
                return (
                <div key={source.id} className="border-b border-[color:var(--dos-border-soft)] px-5 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{source.name}</h3>
                        <Badge variant="outline" className="border-white/15 text-slate-300">{source.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {source.connectionConfig.username}@{source.connectionConfig.host}:{source.connectionConfig.port}/{source.connectionConfig.database}
                      </p>
                      <p className="mt-1 text-[11px] text-cyan-300/70">
                        schemas: {(source.connectionConfig.schemas?.length ? source.connectionConfig.schemas : ['public']).join(', ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 border-[color:var(--dos-danger)] bg-[var(--dos-danger-soft)] text-[var(--dos-danger-text)] hover:bg-[var(--dos-danger-soft)]"
                        onClick={() => void handleRemoveSource(source)}
                        disabled={demoMode || busySourceId === source.id}
                        title="Remove data source"
                        aria-label={`Remove ${source.name}`}
                      >
                        {busySourceId === source.id && busyAction === 'remove'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <X className="h-4 w-4" />}
                      </Button>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <KeyRound className="h-3.5 w-3.5 text-cyan-300" />
                        key {source.credentialKeyId ?? 'pending'}
                      </div>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 border-[color:var(--dos-border-soft)] bg-transparent text-[var(--dos-text-secondary)]"
                        onClick={() => void handleTest(source.id)}
                        disabled={busySourceId === source.id}
                        title="Test connection"
                      >
                        {busySourceId === source.id && busyAction === 'test'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <PlugZap className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 border-[color:var(--dos-border-soft)] bg-transparent text-[var(--dos-text-secondary)]"
                        onClick={() => void handleIntrospect(source.id)}
                        disabled={busySourceId === source.id}
                        title="Introspect schema"
                      >
                        {busySourceId === source.id && busyAction === 'introspect'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <FileSearch className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 border-[color:var(--dos-border-soft)] bg-transparent text-[var(--dos-text-secondary)]"
                        onClick={() => void handleRequestRefresh(source.id)}
                        disabled={busySourceId === source.id}
                        title="Request schema refresh"
                      >
                        {busySourceId === source.id && busyAction === 'refresh'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>last test: {source.lastTestStatus ?? 'not run'}</span>
                    {source.lastTestedAt ? <span>{new Date(source.lastTestedAt).toLocaleString()}</span> : null}
                    {source.lastError ? <span className="text-rose-300">{source.lastError}</span> : null}
                  </div>
                  <div className="mt-4 border-t border-[color:var(--dos-border-soft)] pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
                        {schemaStatusLabel(source)}
                      </div>
                      <Badge variant="outline" className="border-white/15 text-slate-300">
                        {source.schemaTableCount} tables / {source.schemaColumnCount} columns
                      </Badge>
                    </div>
                    <div className="mt-2 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
                      <span>last scan: {schemaAgeLabel(source)}</span>
                      <span>next refresh: {source.schemaRefreshAfter ? new Date(source.schemaRefreshAfter).toLocaleString() : 'not scheduled'}</span>
                      {source.schemaHash ? <span className="truncate sm:col-span-2">hash: {source.schemaHash}</span> : null}
                      {source.schemaRefreshRequestedAt ? (
                        <span className="sm:col-span-2">
                          requested {new Date(source.schemaRefreshRequestedAt).toLocaleString()}
                          {source.schemaRefreshReason ? ` (${source.schemaRefreshReason})` : ''}
                        </span>
                      ) : null}
                      {source.schemaLastError ? <span className="text-rose-300 sm:col-span-2">{source.schemaLastError}</span> : null}
                    </div>
                    {profile ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[11px] sm:grid-cols-4">
                        <div>
                          <p className="text-slate-500">Profiled</p>
                          <p className="mt-0.5 text-slate-200">{profile.profiledColumnCount}/{profile.columnCount} columns</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Sensitive</p>
                          <p className="mt-0.5 text-amber-200">{profile.sensitiveColumnCount} masked</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Join evidence</p>
                          <p className="mt-0.5 text-cyan-200">{profile.explicitJoinCount} FK / {profile.inferredJoinCount} inferred</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Evidence status</p>
                          <p className={profile.warningCount > 0 ? 'mt-0.5 text-amber-200' : 'mt-0.5 text-emerald-200'}>
                            {profile.warningCount > 0 ? `${profile.warningCount} warning(s)` : 'ready'}
                          </p>
                        </div>
                        <p className="col-span-2 text-slate-500 sm:col-span-4">
                          scoped to {profile.selectedSchemas.join(', ')} · profile v{profile.profileVersion} · {new Date(profile.generatedAt).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                )
              })
            ) : (
              <div className="px-5 py-10 text-left">
                <Database className="h-7 w-7 text-[var(--dos-text-muted)]" />
                <h3 className="mt-3 text-sm font-semibold">No data sources yet</h3>
                <p className="mt-1 max-w-md text-xs leading-5 text-[var(--dos-text-muted)]">
                  Add a read-only Postgres source after creating a tenant and project.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)] xl:sticky xl:top-20">
          <CardHeader className="border-b border-[color:var(--dos-border-soft)]">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[var(--dos-accent-primary)]" />
              <CardTitle className="text-base">Schema intelligence</CardTitle>
            </div>
            <p className="text-xs leading-5 text-[var(--dos-text-muted)]">Evidence prepared from the latest successful scan.</p>
          </CardHeader>
          <CardContent className="p-0">
            <dl className="divide-y divide-[color:var(--dos-border-soft)]">
              {[
                ['Tables', guidedProfile?.tableCount ?? dataSources.reduce((total, source) => total + source.schemaTableCount, 0)],
                ['Columns', guidedProfile?.columnCount ?? dataSources.reduce((total, source) => total + source.schemaColumnCount, 0)],
                ['Likely measures', guidedProfile?.measures.length ?? 'Review'],
                ['Needs review', guidedProfile?.reviewItems.length ?? 'After scan'],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-xs text-[var(--dos-text-muted)]">{label}</dt>
                  <dd className="font-mono text-sm font-semibold text-[var(--dos-text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
            {guidedProfile ? (
              <div className="border-t border-[color:var(--dos-border-soft)] px-5 py-4 text-xs leading-5 text-[var(--dos-text-muted)]">
                Suggested area: {guidedProfile.businessAreas[0]?.label ?? 'Review schema'} · sensitive fields hidden: {guidedProfile.sensitive.length}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <details className="group rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)]">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)]">
          Connection policy and delivery path
        </summary>
        <div className="grid gap-6 border-t border-[color:var(--dos-border-soft)] p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ol className="grid gap-4 md:grid-cols-5">
            {SCAN_TO_CHART_FLOW.map((step, index) => (
              <li key={step.title} className="border-t border-[color:var(--dos-border-soft)] pt-3">
                <p className="font-mono text-xs text-[var(--dos-accent-primary)]">0{index + 1}</p>
                <p className="mt-2 text-xs font-semibold">{step.title}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--dos-text-muted)]">{step.body}</p>
              </li>
            ))}
          </ol>
          <ul className="space-y-3 border-l border-[color:var(--dos-border-soft)] pl-5 text-xs leading-5 text-[var(--dos-text-muted)]">
            {REQUIREMENTS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </details>

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open)
        if (!open) resetForm()
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Postgres source</DialogTitle>
            <DialogDescription>
              Credentials are encrypted server-side. Use the demo SQL read-only user or a least-privilege database user.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Project</Label>
              <Select
                value={projectId}
                onValueChange={(value) => {
                  const selected = projects.find(project => project.id === value)
                  setProjectId(value)
                  if (selected) setBuilderScope({ tenantId: selected.tenantId, projectId: selected.id }, 'data_source')
                }}
                disabled={projectsLoading || projects.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={projectsLoading ? 'Loading projects' : 'Select a tenant project'} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.tenantName ?? project.tenantSlug ?? 'Tenant'} / {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projects.length === 0 && !projectsLoading ? (
                <p className="text-[11px] text-muted-foreground">
                  Create a tenant project before saving a data source.
                </p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Name</Label>
              <Input value={name} onChange={event => setName(event.target.value)} placeholder="Client reporting database" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Schemas</Label>
              <Input value={schemas} onChange={event => setSchemas(event.target.value)} placeholder="public" />
              <p className="text-[11px] text-muted-foreground">Comma-separated allowlist. Only these schemas are scanned and profiled.</p>
            </div>
            <div className="space-y-2">
              <Label>Host</Label>
              <Input value={host} onChange={event => setHost(event.target.value)} placeholder="db.example.com" />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input value={port} onChange={event => setPort(event.target.value)} placeholder="5432" />
            </div>
            <div className="space-y-2">
              <Label>Database</Label>
              <Input value={database} onChange={event => setDatabase(event.target.value)} placeholder="analytics" />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={username} onChange={event => setUsername(event.target.value)} placeholder="readonly_user" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input value={password} onChange={event => setPassword(event.target.value)} type="password" />
            </div>
            <div className="space-y-2">
              <Label>SSL Mode</Label>
              <Select value={sslMode} onValueChange={value => setSslMode(value as DataSourceSslMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="require">Require</SelectItem>
                  <SelectItem value="prefer">Prefer</SelectItem>
                  <SelectItem value="verify-full">Verify full</SelectItem>
                  <SelectItem value="verify-ca">Verify CA</SelectItem>
                  <SelectItem value="disable">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !projectId || projects.length === 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Save source
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
