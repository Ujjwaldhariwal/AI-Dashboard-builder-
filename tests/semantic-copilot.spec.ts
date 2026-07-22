import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  buildDeterministicSemanticProposal,
  validateSemanticCopilotProposal,
} from '../src/lib/ai/semantic-copilot'
import type { DataSourceColumnMetadata } from '../src/types/data-source'

const sourceId = '10000000-0000-4000-8000-000000000001'

function column(id: string, tableName: string, columnName: string, dataType: string): DataSourceColumnMetadata {
  return {
    id,
    dataSourceId: sourceId,
    relationId: `${id}-relation`,
    schemaName: 'analytics',
    tableName,
    columnName,
    ordinalPosition: 1,
    dataType,
    udtName: dataType,
    isNullable: false,
    columnDefault: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const selectedColumns = [
  column('customer-pk', 'customers', 'id', 'uuid'),
  column('customer-region', 'customers', 'region', 'text'),
  column('order-pk', 'orders', 'id', 'uuid'),
  column('order-customer-fk', 'orders', 'customer_id', 'uuid'),
  column('order-date', 'orders', 'created_at', 'timestamp'),
  column('order-amount', 'orders', 'total_amount', 'numeric'),
]

test.describe('semantic copilot', () => {
  test('builds mappings, metrics, and a join from arbitrary selected tables', () => {
    const proposal = buildDeterministicSemanticProposal(selectedColumns, 'Analyze customer purchasing behavior')

    expect(proposal.mappings).toHaveLength(selectedColumns.length)
    expect(proposal.mappings.some(mapping => mapping.metric?.name === 'Total Amount')).toBeTruthy()
    expect(proposal.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromColumnId: 'customer-pk', toColumnId: 'order-customer-fk', type: 'one_to_many' }),
    ]))
    expect(JSON.stringify(proposal)).not.toContain('electricity')
  })

  test('removes invented columns before a proposal can be applied', () => {
    const base = buildDeterministicSemanticProposal(selectedColumns)
    const checked = validateSemanticCopilotProposal({
      proposal: {
        ...base,
        mappings: [
          base.mappings[0],
          { ...base.mappings[1], columnId: 'invented-column' },
        ],
      },
      selectedColumns,
    })

    expect(checked.proposal.mappings).toHaveLength(1)
    expect(checked.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unknown_column' })]))
  })

  test('grounds the server and UI in the confirmed schema scope', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/admin/semantic-models/[id]/ai-proposal/route.ts'), 'utf8')
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/semantic-model-admin-panel.tsx'), 'utf8')

    expect(route).toContain("from('data_source_relation_selections')")
    expect(route).toContain(".eq('status', 'included')")
    expect(route).toContain('generateObject({')
    expect(route).toContain('createAiWorkflowProposal')
    expect(route).toContain('markAiWorkflowAwaitingReview')
    expect(panel).toContain("scope: 'selected'")
    expect(panel).toContain('/ai-proposal')
    expect(panel).not.toContain('/api/admin/guided-review/profile')
    expect(panel).not.toContain('electricity_readings')
    expect(panel).not.toContain('electricity_customers')
  })
})
