import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import {
  mapDashboardChartSlot,
  mapDashboardPage,
  mapDashboardVersion,
  mapPublishedDashboard,
} from '@/lib/publishing/dashboard-publishing'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const SlotSchema = z.object({
  chartConfigId: z.string().uuid(),
  title: z.string().max(120).optional().or(z.literal('')),
  slotKey: z.string().min(1).max(80),
  rowIndex: z.number().int().min(0).default(0),
  columnIndex: z.number().int().min(0).default(0),
  width: z.number().int().min(1).max(12).default(6),
  height: z.number().int().min(1).max(24).default(4),
  settings: z.record(z.unknown()).default({}),
}).strict()

const PageSchema = z.object({
  title: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sortOrder: z.number().int().min(0).default(0),
  layout: z.record(z.unknown()).default({}),
  slots: z.array(SlotSchema).default([]),
}).strict()

const VersionCreateSchema = z.object({
  title: z.string().min(2).max(120),
  notes: z.string().max(1000).optional().or(z.literal('')),
  layout: z.record(z.unknown()).default({}),
  pages: z.array(PageSchema).min(1).max(20),
}).strict()

async function nextVersionNumber(supabase: SupabaseClient, dashboardId: string) {
  const { data, error } = await supabase
    .from('dashboard_versions')
    .select('version_number')
    .eq('dashboard_id', dashboardId)
    .order('version_number', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  return Number(data?.[0]?.version_number ?? 0) + 1
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ versions: [], pages: [], slots: [], error: 'Unauthorized' }, { status: 401 })

    const { data: dashboardRow, error: dashboardError } = await auth.supabase
      .from('published_dashboards')
      .select('*')
      .eq('id', id)
      .single()

    if (dashboardError || !dashboardRow) {
      return NextResponse.json({ versions: [], pages: [], slots: [], error: dashboardError?.message ?? 'Dashboard not found' }, { status: 404 })
    }

    const dashboard = mapPublishedDashboard(dashboardRow as Record<string, unknown>)
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: dashboard.tenantId,
      projectId: dashboard.projectId,
    })
    if (!access.ok) {
      return NextResponse.json({ versions: [], pages: [], slots: [], error: access.error }, { status: access.status })
    }

    const { data: versions, error: versionsError } = await auth.supabase
      .from('dashboard_versions')
      .select('*')
      .eq('dashboard_id', dashboard.id)
      .order('version_number', { ascending: false })

    if (versionsError) return NextResponse.json({ versions: [], pages: [], slots: [], error: versionsError.message }, { status: 500 })

    const versionIds = (versions ?? []).map(version => String(version.id))
    const [pagesResult, slotsResult] = await Promise.all([
      versionIds.length > 0
        ? auth.supabase.from('dashboard_pages').select('*').in('version_id', versionIds).order('sort_order', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      versionIds.length > 0
        ? auth.supabase.from('dashboard_chart_slots').select('*').in('version_id', versionIds).order('row_index', { ascending: true }).order('column_index', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (pagesResult.error) return NextResponse.json({ versions: [], pages: [], slots: [], error: pagesResult.error.message }, { status: 500 })
    if (slotsResult.error) return NextResponse.json({ versions: [], pages: [], slots: [], error: slotsResult.error.message }, { status: 500 })

    return NextResponse.json({
      versions: (versions ?? []).map(row => mapDashboardVersion(row as Record<string, unknown>)),
      pages: (pagesResult.data ?? []).map(row => mapDashboardPage(row as Record<string, unknown>)),
      slots: (slotsResult.data ?? []).map(row => mapDashboardChartSlot(row as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ versions: [], pages: [], slots: [], error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ version: null, pages: [], slots: [], error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = VersionCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ version: null, pages: [], slots: [], error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: dashboardRow, error: dashboardError } = await auth.supabase
      .from('published_dashboards')
      .select('*')
      .eq('id', id)
      .single()

    if (dashboardError || !dashboardRow) {
      return NextResponse.json({ version: null, pages: [], slots: [], error: dashboardError?.message ?? 'Dashboard not found' }, { status: 404 })
    }

    const dashboard = mapPublishedDashboard(dashboardRow as Record<string, unknown>)
    if (dashboard.status === 'archived') {
      return NextResponse.json({ version: null, pages: [], slots: [], error: 'Archived dashboards cannot receive new versions' }, { status: 409 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: dashboard.tenantId,
      projectId: dashboard.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ version: null, pages: [], slots: [], error: access.error }, { status: access.status })
    }

    const chartIds = [...new Set(parsed.data.pages.flatMap(page => page.slots.map(slot => slot.chartConfigId)))]
    if (chartIds.length > 0) {
      const { data: charts, error: chartsError } = await auth.supabase
        .from('dashboard_chart_configs')
        .select('id')
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId)
        .eq('status', 'published')
        .in('validation_state', ['valid', 'warning'])
        .in('id', chartIds)

      if (chartsError) return NextResponse.json({ version: null, pages: [], slots: [], error: chartsError.message }, { status: 500 })
      const foundIds = new Set((charts ?? []).map(chart => String(chart.id)))
      const missingIds = chartIds.filter(chartId => !foundIds.has(chartId))
      if (missingIds.length > 0) {
        return NextResponse.json({
          version: null,
          pages: [],
          slots: [],
          error: 'All dashboard slots must reference published, valid chart configs in the same project',
          missingChartIds: missingIds,
        }, { status: 422 })
      }
    }

    const nowIso = new Date().toISOString()
    const versionNumber = await nextVersionNumber(auth.supabase, dashboard.id)
    const { data: versionRow, error: versionError } = await auth.supabase
      .from('dashboard_versions')
      .insert({
        dashboard_id: dashboard.id,
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        version_number: versionNumber,
        status: 'draft',
        release_snapshot_status: 'pending',
        release_snapshot_created_at: null,
        title: parsed.data.title.trim(),
        notes: parsed.data.notes?.trim() || null,
        layout: parsed.data.layout,
        created_by: auth.userId,
        created_at: nowIso,
      })
      .select('*')
      .single()

    if (versionError) return NextResponse.json({ version: null, pages: [], slots: [], error: versionError.message }, { status: 400 })
    const version = mapDashboardVersion(versionRow as Record<string, unknown>)

    const pageRows = parsed.data.pages.map(page => ({
      version_id: version.id,
      dashboard_id: dashboard.id,
      tenant_id: dashboard.tenantId,
      project_id: dashboard.projectId,
      title: page.title.trim(),
      slug: page.slug,
      sort_order: page.sortOrder,
      layout: page.layout,
      created_at: nowIso,
    }))

    const { data: insertedPages, error: pagesError } = await auth.supabase
      .from('dashboard_pages')
      .insert(pageRows)
      .select('*')

    if (pagesError) return NextResponse.json({ version: null, pages: [], slots: [], error: pagesError.message }, { status: 400 })
    const pages = (insertedPages ?? []).map(row => mapDashboardPage(row as Record<string, unknown>))

    const pageBySlug = new Map(pages.map(page => [page.slug, page]))
    const slotRows = parsed.data.pages.flatMap(page => {
      const insertedPage = pageBySlug.get(page.slug)
      if (!insertedPage) return []
      return page.slots.map(slot => ({
        page_id: insertedPage.id,
        version_id: version.id,
        dashboard_id: dashboard.id,
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        chart_config_id: slot.chartConfigId,
        title: slot.title?.trim() || null,
        slot_key: slot.slotKey,
        row_index: slot.rowIndex,
        column_index: slot.columnIndex,
        width: slot.width,
        height: slot.height,
        settings: slot.settings,
        created_at: nowIso,
      }))
    })

    const insertedSlots = slotRows.length > 0
      ? await auth.supabase.from('dashboard_chart_slots').insert(slotRows).select('*')
      : { data: [], error: null }

    if (insertedSlots.error) {
      return NextResponse.json({ version: null, pages: [], slots: [], error: insertedSlots.error.message }, { status: 400 })
    }
    const slots = (insertedSlots.data ?? []).map(row => mapDashboardChartSlot(row as Record<string, unknown>))

    await Promise.all([
      auth.supabase.from('dashboard_publish_events').insert({
        dashboard_id: dashboard.id,
        version_id: version.id,
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        actor_user_id: auth.userId,
        event_type: 'version_created',
        notes: version.notes,
        metadata: { versionNumber: version.versionNumber, pageCount: pages.length, slotCount: slots.length },
        created_at: nowIso,
      }),
      auth.supabase.from('audit_logs').insert({
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        actor_user_id: auth.userId,
        action: 'dashboard_version.created',
        target_type: 'dashboard_version',
        target_id: version.id,
        metadata: { dashboardId: dashboard.id, versionNumber: version.versionNumber },
        created_at: nowIso,
      }),
    ])

    return NextResponse.json({ version, pages, slots }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ version: null, pages: [], slots: [], error: message }, { status: 500 })
  }
}
