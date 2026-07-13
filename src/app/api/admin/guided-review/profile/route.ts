import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  approveGuidedProfileDraft,
  getLatestGuidedProfile,
  updateGuidedProfileDecision,
} from '@/lib/dashboardos/guided-review-store'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const DecisionSchema = z.object({
  profileId: z.string().uuid(),
  itemId: z.string().min(1).max(240),
  action: z.enum([
    'approve',
    'reject',
    'edit_classification',
    'confirm_relationship',
    'reject_relationship',
    'keep_hidden',
    'unhide',
  ]),
  overrideKind: z.enum([
    'fact_table',
    'dimension_table',
    'date_time_column',
    'id_candidate',
    'foreign_key_candidate',
    'category_field',
    'status_field',
    'name_field',
    'numeric_measure',
    'sensitive_field',
    'relationship_candidate',
    'business_area',
  ]).optional(),
  note: z.string().max(240).optional().or(z.literal('')),
}).strict()

const ApprovalSchema = z.object({
  profileId: z.string().uuid(),
  action: z.literal('approve_semantic_draft'),
}).strict()

function isMissingGuidedSchema(message: string) {
  return /relation .*guided_schema_profiles.* does not exist|schema cache|could not find the table/i.test(message)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401 })

    const projectId = req.nextUrl.searchParams.get('projectId')
    const dataSourceId = req.nextUrl.searchParams.get('dataSourceId')
    if (!projectId) return NextResponse.json({ profile: null, error: 'projectId is required' }, { status: 400 })

    const access = await requireProjectAccess({ ...accessContext(auth), projectId })
    if (!access.ok) return NextResponse.json({ profile: null, error: access.error }, { status: access.status })

    const profile = await getLatestGuidedProfile({
      supabase: auth.supabase,
      projectId,
      dataSourceId,
    })

    return NextResponse.json({ profile })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ profile: null, error: message }, { status: isMissingGuidedSchema(message) ? 503 : 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const approval = ApprovalSchema.safeParse(body)
    const decision = DecisionSchema.safeParse(body)
    if (!approval.success && !decision.success) {
      return NextResponse.json({ profile: null, error: decision.error?.flatten() ?? approval.error.flatten() }, { status: 400 })
    }

    const decisionData = decision.success ? decision.data : null
    const profileId = approval.success ? approval.data.profileId : decisionData?.profileId
    if (!profileId) return NextResponse.json({ profile: null, error: 'profileId is required' }, { status: 400 })
    const { data: profileRow, error: profileError } = await auth.supabase
      .from('guided_schema_profiles')
      .select('tenant_id, project_id')
      .eq('id', profileId)
      .single()

    if (profileError || !profileRow) {
      return NextResponse.json({ profile: null, error: profileError?.message ?? 'Guided profile not found' }, { status: 404 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(profileRow.tenant_id),
      projectId: String(profileRow.project_id),
      editor: true,
    })
    if (!access.ok) return NextResponse.json({ profile: null, error: access.error }, { status: access.status })

    const nowIso = new Date().toISOString()
    const profile = approval.success
      ? await approveGuidedProfileDraft({
        supabase: auth.supabase,
        profileId: approval.data.profileId,
        actorUserId: auth.userId,
      })
      : decisionData
      ? await updateGuidedProfileDecision({
        supabase: auth.supabase,
        profileId: decisionData.profileId,
        decision: {
          itemId: decisionData.itemId,
          action: decisionData.action,
          overrideKind: decisionData.overrideKind,
          note: decisionData.note?.trim() || null,
          decidedBy: auth.userId,
          decidedAt: nowIso,
        },
      })
      : null

    if (!profile) return NextResponse.json({ profile: null, error: 'Invalid guided review action' }, { status: 400 })

    await auth.supabase.from('audit_logs').insert({
      tenant_id: profile.tenantId,
      project_id: profile.projectId,
      actor_user_id: auth.userId,
      action: approval.success ? 'guided_review.semantic_draft_approved' : 'guided_review.decision_recorded',
      target_type: 'guided_schema_profile',
      target_id: profile.id,
      metadata: approval.success
        ? { semanticDraftStatus: profile.state.semanticDraftStatus }
        : { itemId: decisionData?.itemId, action: decisionData?.action, overrideKind: decisionData?.overrideKind ?? null },
      created_at: nowIso,
    })

    return NextResponse.json({ profile })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ profile: null, error: message }, { status: isMissingGuidedSchema(message) ? 503 : 500 })
  }
}
