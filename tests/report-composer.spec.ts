import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  REPORT_SPEC_VERSION,
  buildDeterministicReportSpec,
  validateReportSpec,
  type ReportDatasetEvidence,
  type ReportFact,
} from '../src/lib/ai/report-composer'

const ids = {
  dataset: '10000000-0000-4000-8000-000000000001',
  dateField: '20000000-0000-4000-8000-000000000001',
  regionField: '20000000-0000-4000-8000-000000000002',
  metric: '30000000-0000-4000-8000-000000000001',
  invented: '90000000-0000-4000-8000-000000000001',
}

const datasets: ReportDatasetEvidence[] = [{
  id: ids.dataset,
  name: 'Revenue performance',
  description: 'Published revenue by month and region.',
  fields: [
    { id: ids.dateField, name: 'Order month', role: 'date' },
    { id: ids.regionField, name: 'Region', role: 'dimension' },
  ],
  metrics: [
    { id: ids.metric, name: 'Total revenue', aggregation: 'sum' },
  ],
}]

function deterministic() {
  return buildDeterministicReportSpec({
    instruction: 'Create a monthly revenue report by region',
    title: 'Revenue review',
    organizationName: 'Acme',
    datasets,
  })
}

test.describe('governed report composer', () => {
  test('builds a versioned report outline only from governed datasets', () => {
    const proposal = deterministic()

    expect(proposal.version).toBe(REPORT_SPEC_VERSION)
    expect(proposal.pages).toHaveLength(1)
    expect(proposal.sections[0].datasetIds).toEqual([ids.dataset])
    expect(proposal.sections[0].blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'chart',
        datasetId: ids.dataset,
        template: 'line',
        metricIds: [ids.metric],
      }),
      expect.objectContaining({
        kind: 'table',
        datasetId: ids.dataset,
      }),
    ]))
    expect(proposal.warnings[0]).toContain('deterministic facts')
  })

  test('sanitizes invented semantic references and removes uncited claims', () => {
    const proposal = deterministic()
    const section = proposal.sections[0]
    const chartIndex = section.blocks.findIndex(block => block.kind === 'chart')
    const chart = section.blocks[chartIndex]
    if (chart.kind !== 'chart') throw new Error('Expected deterministic chart')

    const checked = validateReportSpec({
      spec: {
        ...proposal,
        sections: [{
          ...section,
          blocks: [
            ...section.blocks.slice(0, chartIndex),
            {
              ...chart,
              fieldIds: [...chart.fieldIds, ids.invented],
              metricIds: [...chart.metricIds, ids.invented],
            },
            ...section.blocks.slice(chartIndex + 1),
            {
              kind: 'narrative',
              id: 'narrative_1',
              title: 'Executive interpretation',
              claims: [{
                text: 'Revenue increased materially.',
                citationFactIds: ['fact_missing'],
              }],
            },
          ],
        }],
      },
      datasets,
      facts: [],
    })

    const sanitizedChart = checked.proposal.sections[0].blocks.find(block => block.kind === 'chart')
    const narrative = checked.proposal.sections[0].blocks.find(block => block.kind === 'narrative')
    expect(sanitizedChart).toEqual(expect.objectContaining({
      fieldIds: [ids.dateField],
      metricIds: [ids.metric],
    }))
    expect(narrative).toEqual(expect.objectContaining({ claims: [] }))
    expect(checked.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'chart_references_sanitized' }),
      expect.objectContaining({ code: 'uncited_claim' }),
    ]))
  })

  test('retains a narrative claim only when it cites deterministic evidence', () => {
    const proposal = deterministic()
    const fact: ReportFact = {
      id: 'fact_revenue_total',
      datasetId: ids.dataset,
      metricId: ids.metric,
      label: 'Total revenue',
      value: 125000,
      formattedValue: '$125,000',
      queryHash: 'a'.repeat(64),
      computedAt: '2026-07-24T08:00:00.000Z',
    }
    const section = proposal.sections[0]
    const checked = validateReportSpec({
      spec: {
        ...proposal,
        sections: [{
          ...section,
          blocks: [...section.blocks, {
            kind: 'narrative',
            id: 'narrative_1',
            title: 'Executive interpretation',
            claims: [{
              text: 'Total governed revenue is $125,000.',
              citationFactIds: [fact.id],
            }],
          }],
        }],
      },
      datasets,
      facts: [fact],
    })

    expect(checked.proposal.sections[0].blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'narrative',
        claims: [{
          text: 'Total governed revenue is $125,000.',
          citationFactIds: [fact.id],
        }],
      }),
    ]))
    expect(checked.issues).toEqual([])
  })

  test('proposal API requires project editor access and published governed datasets', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/admin/projects/[id]/report-proposal/route.ts'),
      'utf8',
    )

    expect(route).toContain('requireProjectAccess({')
    expect(route).toContain('editor: true')
    expect(route).toContain(".eq('status', 'published')")
    expect(route).toContain("model.status === 'approved'")
    expect(route).toContain("workflowType: 'report_generation'")
    expect(route).toContain("artifactType: 'report'")
    expect(route).toContain('validateReportSpec({ spec: result.object, datasets, facts: [] })')
    expect(route).toContain('requiresReview: true')
  })
})
