import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { buildDeterministicDatasetProposal, validateDatasetCopilotProposal } from '../src/lib/ai/dataset-copilot'

const ids = {
  customerEntity: '10000000-0000-4000-8000-000000000001',
  orderEntity: '10000000-0000-4000-8000-000000000002',
  dateField: '20000000-0000-4000-8000-000000000001',
  regionField: '20000000-0000-4000-8000-000000000002',
  metric: '30000000-0000-4000-8000-000000000001',
  relationship: '40000000-0000-4000-8000-000000000001',
  invented: '90000000-0000-4000-8000-000000000001',
}

const fields = [
  { id: ids.dateField, entityId: ids.orderEntity, entityName: 'Order', name: 'Order Date', role: 'date' as const },
  { id: ids.regionField, entityId: ids.customerEntity, entityName: 'Customer', name: 'Region', role: 'dimension' as const },
]
const metrics = [
  { id: ids.metric, entityId: ids.orderEntity, name: 'Total Revenue', aggregation: 'sum' as const },
]
const relationships = [
  { id: ids.relationship, fromEntityId: ids.customerEntity, toEntityId: ids.orderEntity, type: 'one_to_many' as const },
]

test.describe('dataset copilot', () => {
  test('turns a business request into a compact governed selection', () => {
    const proposal = buildDeterministicDatasetProposal({
      instruction: 'Compare monthly revenue by customer region',
      fields,
      metrics,
      relationships,
    })

    expect(proposal.fieldIds).toEqual(expect.arrayContaining([ids.dateField, ids.regionField]))
    expect(proposal.metricIds).toEqual([ids.metric])
    expect(proposal.relationshipIds).toEqual([ids.relationship])
    expect(proposal.name).toContain('Compare monthly revenue')
  })

  test('removes semantic IDs that do not belong to the approved model', () => {
    const proposal = buildDeterministicDatasetProposal({ instruction: 'Revenue by region', fields, metrics, relationships })
    const checked = validateDatasetCopilotProposal({
      proposal: { ...proposal, fieldIds: [...proposal.fieldIds, ids.invented] },
      fields,
      metrics,
      relationships,
    })

    expect(checked.proposal.fieldIds).not.toContain(ids.invented)
    expect(checked.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unknown_field' })]))
  })

  test('keeps disconnected schemas coherent around the selected metric entity', () => {
    const snapshotEntity = '50000000-0000-4000-8000-000000000001'
    const issueEntity = '50000000-0000-4000-8000-000000000002'
    const snapshotDate = '60000000-0000-4000-8000-000000000001'
    const detectedAt = '60000000-0000-4000-8000-000000000002'
    const duplicateMetric = '70000000-0000-4000-8000-000000000001'
    const proposal = buildDeterministicDatasetProposal({
      instruction: 'Build an executive MDM quality dashboard',
      fields: [
        { id: snapshotDate, entityId: snapshotEntity, entityName: 'Data Quality Snapshot', name: 'Snapshot Date', role: 'date' },
        { id: detectedAt, entityId: issueEntity, entityName: 'Stewardship Issue', name: 'Detected At', role: 'date' },
      ],
      metrics: [
        { id: duplicateMetric, entityId: snapshotEntity, name: 'Total Duplicate Record Count', aggregation: 'sum' },
      ],
      relationships: [],
    })

    expect(proposal.metricIds).toEqual([duplicateMetric])
    expect(proposal.fieldIds).toEqual([snapshotDate])
    expect(proposal.warnings).toEqual([])
  })

  test('selects the complete approved relationship path for preferred KPI fields', () => {
    const accountEntity = '10000000-0000-4000-8000-000000000003'
    const segmentField = '20000000-0000-4000-8000-000000000003'
    const accountRelationship = '40000000-0000-4000-8000-000000000002'
    const proposal = buildDeterministicDatasetProposal({
      instruction: 'Revenue by customer segment',
      fields: [
        ...fields,
        { id: segmentField, entityId: accountEntity, entityName: 'Account', name: 'Segment', role: 'dimension' },
      ],
      metrics,
      relationships: [
        ...relationships,
        { id: accountRelationship, fromEntityId: ids.customerEntity, toEntityId: accountEntity, type: 'one_to_many' },
      ],
      preferredFieldIds: [segmentField],
      preferredMetricIds: [ids.metric],
    })

    expect(proposal.relationshipIds).toEqual([ids.relationship, accountRelationship])
    expect(proposal.warnings).toEqual([])
  })

  test('uses an approved model proposal API instead of fixed guided recipes', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/admin/semantic-models/[id]/dataset-proposal/route.ts'), 'utf8')
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/datasets-admin-panel.tsx'), 'utf8')

    expect(route).toContain("model.status !== 'approved'")
    expect(route).toContain("workflowType: 'dataset_planning'")
    expect(route).toContain('generateObject({')
    expect(route).toContain('validateDatasetCopilotProposal')
    expect(panel).toContain('/dataset-proposal')
    expect(panel).toContain('Business request')
    expect(panel).not.toContain('/api/admin/guided-review/dataset-draft')
    expect(panel).not.toContain('guidedRecipes')
  })
})
