import { Calendar, Download, Filter, LayoutDashboard, LockKeyhole, RefreshCw, Table2 } from 'lucide-react'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAuthedSupabase } from '@/lib/supabase/server'

interface TenantRecord {
  id: string
  name: string
  slug: string
  status: string
  primary_domain?: string | null
}

interface ProjectRecord {
  id: string
  name: string
  description?: string | null
  status: string
}

interface DatasetRecord {
  id: string
  project_id: string
  name: string
  description?: string | null
  status: string
  selection?: {
    fieldIds?: string[]
    metricIds?: string[]
    relationshipIds?: string[]
  } | null
  cache_policy?: {
    ttlSeconds?: number
  } | null
  updated_at?: string | null
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return 'Not published yet'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function selectionCount(dataset: DatasetRecord, key: 'fieldIds' | 'metricIds' | 'relationshipIds') {
  const value = dataset.selection?.[key]
  return Array.isArray(value) ? value.length : 0
}

export default async function TenantClientPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  const auth = await getAuthedSupabase()
  if (!auth) notFound()

  const { data: tenant, error: tenantError } = await auth.supabase
    .from('tenants')
    .select('id, name, slug, status, primary_domain')
    .eq('slug', tenantSlug)
    .eq('status', 'active')
    .single()

  if (tenantError || !tenant) notFound()
  const activeTenant = tenant as TenantRecord

  const [{ data: projects, error: projectsError }, { data: datasets, error: datasetsError }] = await Promise.all([
    auth.supabase
      .from('dashboard_projects')
      .select('id, name, description, status')
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false }),
    auth.supabase
      .from('semantic_datasets')
      .select('id, project_id, name, description, status, selection, cache_policy, updated_at')
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'published')
      .order('updated_at', { ascending: false }),
  ])

  if (projectsError || datasetsError) {
    throw new Error(projectsError?.message ?? datasetsError?.message ?? 'Failed to load client dashboard')
  }

  const projectList = (projects ?? []) as ProjectRecord[]
  const datasetList = (datasets ?? []) as DatasetRecord[]
  const datasetsByProject = new Map<string, DatasetRecord[]>()
  for (const dataset of datasetList) {
    datasetsByProject.set(dataset.project_id, [...(datasetsByProject.get(dataset.project_id) ?? []), dataset])
  }

  return (
    <div className="min-h-screen bg-[#f8f8f2] text-[#272822]">
      <header className="border-b border-[#272822]/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#272822] text-[#a6e22e]">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[#75715e]">{activeTenant.name}</p>
              <h1 className="truncate text-lg font-semibold">Published Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-[#a6e22e]/40 bg-[#a6e22e]/15 text-[#3d520d] sm:inline-flex">
              Read-only
            </Badge>
            <Button variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" className="bg-[#272822] text-[#f8f8f2] hover:bg-[#3e3d32]" disabled={datasetList.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              PDF Report
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="rounded-lg border border-[#272822]/10 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Client dashboard runtime</h2>
              <p className="mt-1 text-xs text-[#75715e]">
                Published datasets only. Builder controls, source credentials, and semantic draft assets stay hidden from this view.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                Date Range
              </Button>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-[#272822]/10 bg-white">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#75715e]">Projects</p>
              <p className="mt-2 text-2xl font-semibold">{projectList.length}</p>
            </CardContent>
          </Card>
          <Card className="border-[#272822]/10 bg-white">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#75715e]">Published datasets</p>
              <p className="mt-2 text-2xl font-semibold">{datasetList.length}</p>
            </CardContent>
          </Card>
          <Card className="border-[#272822]/10 bg-white">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#75715e]">Access mode</p>
              <p className="mt-2 text-2xl font-semibold">Read only</p>
            </CardContent>
          </Card>
        </section>

        {projectList.length === 0 ? (
          <section className="rounded-lg border border-dashed border-[#272822]/15 bg-white p-10 text-center">
            <LockKeyhole className="mx-auto h-8 w-8 text-[#75715e]" />
            <h2 className="mt-3 text-sm font-semibold">No active projects available</h2>
            <p className="mt-1 text-xs text-[#75715e]">Ask your dashboard team to publish a tenant project first.</p>
          </section>
        ) : (
          <section className="space-y-4">
            {projectList.map(project => {
              const projectDatasets = datasetsByProject.get(project.id) ?? []
              return (
                <div key={project.id} className="rounded-lg border border-[#272822]/10 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">{project.name}</h2>
                      <p className="mt-1 text-xs text-[#75715e]">
                        {project.description || 'Published client datasets for this workspace.'}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-[#fd971f]/30 bg-[#fd971f]/10 text-[#8a4b00]">
                      {projectDatasets.length} datasets
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {projectDatasets.length === 0 ? (
                      <div className="rounded-md border border-dashed border-[#272822]/15 bg-[#f8f8f2] p-6 text-center text-xs text-[#75715e] md:col-span-2">
                        No published datasets in this project yet.
                      </div>
                    ) : projectDatasets.map(dataset => (
                      <Card key={dataset.id} className="border-[#272822]/10 bg-[#f8f8f2]">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">{dataset.name}</h3>
                              <p className="mt-1 text-xs text-[#75715e]">
                                {dataset.description || 'Published semantic dataset'}
                              </p>
                            </div>
                            <Table2 className="h-4 w-4 text-[#a6e22e]" />
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-md bg-white px-3 py-2">
                              <p className="text-[#75715e]">Fields</p>
                              <p className="mt-1 font-semibold">{selectionCount(dataset, 'fieldIds')}</p>
                            </div>
                            <div className="rounded-md bg-white px-3 py-2">
                              <p className="text-[#75715e]">Metrics</p>
                              <p className="mt-1 font-semibold">{selectionCount(dataset, 'metricIds')}</p>
                            </div>
                            <div className="rounded-md bg-white px-3 py-2">
                              <p className="text-[#75715e]">Joins</p>
                              <p className="mt-1 font-semibold">{selectionCount(dataset, 'relationshipIds')}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-[11px] text-[#75715e]">
                            Updated {formatUpdatedAt(dataset.updated_at)} / cache {dataset.cache_policy?.ttlSeconds ?? 300}s
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )}
      </main>
    </div>
  )
}
