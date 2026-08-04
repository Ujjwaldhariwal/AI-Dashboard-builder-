import { expect, test } from '@playwright/test'

import {
  planGovernedQueryIntent,
  type GovernedQueryAsset,
} from '../src/lib/ai/governed-query-intent'

const assets: GovernedQueryAsset[] = [
  { id: 'duplicate-count', name: 'Total Duplicate Record Count', role: 'metric' },
  { id: 'open-issues', name: 'Open Issues', role: 'dimension' },
  { id: 'quality-score', name: 'Average Quality Score', role: 'metric' },
  { id: 'snapshot-date', name: 'Snapshot Date', role: 'dimension' },
]

test('resolves governed metric, dimension, visualization, and limit without inventing IDs', () => {
  const intent = planGovernedQueryIntent(
    'Show the top 5 total duplicate record count by open issues',
    assets,
  )

  expect(intent.metricIds).toEqual(['duplicate-count'])
  expect(intent.dimensionIds).toEqual(['open-issues'])
  expect(intent.visualization).toBe('bar')
  expect(intent.limit).toBe(5)
  expect(intent.sort).toEqual({ byId: 'duplicate-count', direction: 'desc' })
  expect(intent.clarification).toBeNull()
})
test('uses the governed time dimension for a broad trend question', () => {
  const intent = planGovernedQueryIntent('Which metrics changed the most over time?', assets)

  expect(intent.metricIds).toEqual(['duplicate-count', 'quality-score'])
  expect(intent.dimensionIds).toEqual(['snapshot-date'])
  expect(intent.visualization).toBe('line')
  expect(intent.clarification).toBeNull()
})

test('asks for clarification instead of guessing an unmatched metric', () => {
  const intent = planGovernedQueryIntent('Show customer happiness by open issues', assets)

  expect(intent.metricIds).toEqual([])
  expect(intent.dimensionIds).toEqual(['open-issues'])
  expect(intent.clarification).toContain('Which governed metric')
  expect(intent.confidence).toBeLessThan(0.5)
})
