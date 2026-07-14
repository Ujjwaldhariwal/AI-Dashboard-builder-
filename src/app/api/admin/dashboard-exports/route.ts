import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { enqueuePlatformJob } from '@/lib/jobs/platform-jobs'
import { listDashboardExportArtifacts } from '@/lib/publishing/dashboard-export-artifact'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const ExportTypeSchema = z.enum(['manifest_json', 'report_pdf', 'bundle_zip'])

const CreateExportSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  dashboardId: z.string().uuid().optional(),
  versionId: z.string().uuid().optional(),
  exportType: ExportTypeSchema.default('manifest_json'),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
}).strict().refine(value => Boolean(value.dashboardId || value.versionId), {
  message: 'dashboardId or versionId is required',
  path: ['dashboardId'],
})

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

async function requireExportAccess({
  auth,
  tenantId,
  projectId,
  editor = false,
}: {
  auth: Awaited<ReturnType<typeof getAuthedSupabase>>
  tenantId: string | null
  projectId: string | null
  editor?: boolean
}) {
  if (!auth) return NextResponse.json({ exports: [], error: 'Unauthorized' }, { status: 401 })

  const access = accessContext(auth)
  if (projectId) {
    const projectAccess = await requireProjectAccess({
      ...access,
      tenantId: tenantId ?? undefined,
      projectId,
      editor,
    })
    if (!projectAccess.ok) {
      return NextResponse.json({ exports: [], error: projectAccess.error }, { status: projectAccess.status })
    }
  } else if (tenantId) {
    const tenantAccess = await requireTenantAccess({ ...access, tenantId, editor })
    if (!tenantAccess.ok) {
      return NextResponse.json({ exports: [], error: tenantAccess.error }, { status: tenantAccess.status })
    }
  } else if (auth.role !== 'admin') {
    return NextResponse.json({ exports: [], error: 'tenantId or projectId is required' }, { status: 400 })
  }

  return auth
}

async function verifyExportTarget({
  auth,
  tenantId,
  projectId,
  dashboardId,
  versionId,
}: {
  auth: NonNullable<Awaited<ReturnType<typeof getAuthedSupabase>>>
  tenantId: string
  projectId: string
  dashboardId?: string
  versionId?: string
}) {
  if (versionId) {
    const { data, error } = await auth.supabase
      .from('dashboard_versions')
      .select('id, dashboard_id, tenant_id, project_id')
      .eq('id', versionId)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null
    return { targetType: 'dashboard_version' as const, targetId: String(data.id), dashboardId: String(data.dashboard_id) }
  }

  const { data, error } = await auth.supabase
    .from('published_dashboards')
    .select('id, current_version_id, tenant_id, project_id')
    .eq('id', dashboardId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .neq('status', 'archived')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return { targetType: 'dashboard' as const, targetId: String(data.id), dashboardId: String(data.id) }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const dashboardId = req.nextUrl.searchParams.get('dashboardId')
    const access = await requireExportAccess({ auth, tenantId, projectId })
    if (access instanceof Response) return access

    const exports = await listDashboardExportArtifacts({
      supabase: access.supabase,
      tenantId,
      projectId,
      dashboardId,
      limit: clampLimit(req.nextUrl.searchParams.get('limit')),
    })

    return NextResponse.json({ exports })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ exports: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ job: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = CreateExportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ job: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireExportAccess({
      auth,
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (access instanceof Response) {
      const body = await access.json().catch(() => ({ error: 'Forbidden' }))
      return NextResponse.json({ job: null, error: body.error ?? 'Forbidden' }, { status: access.status })
    }

    const target = await verifyExportTarget({
      auth: access,
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      dashboardId: parsed.data.dashboardId,
      versionId: parsed.data.versionId,
    })
    if (!target) return NextResponse.json({ job: null, error: 'Export target not found' }, { status: 404 })

    const job = await enqueuePlatformJob({
      supabase: access.supabase,
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      jobType: 'export',
      targetType: target.targetType,
      targetId: target.targetId,
      priority: parsed.data.priority,
      dedupeKey: `export:${target.targetType}:${target.targetId}:${parsed.data.exportType}`,
      payload: {
        exportType: parsed.data.exportType,
        dashboardId: target.dashboardId,
      },
      createdBy: access.userId,
    })

    return NextResponse.json({ job }, { status: 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ job: null, error: message }, { status: 500 })
  }
}
