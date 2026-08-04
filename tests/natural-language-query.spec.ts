import { expect, test } from '@playwright/test'

import { normalizeNaturalLanguageQueryResult } from '../src/lib/ai/natural-language-query-result'

test.describe('natural-language query result contract', () => {
  test('normalizes a grounded AI table response with confidence and warnings', () => {
    expect(normalizeNaturalLanguageQueryResult({
      answer: 'Revenue increased after the April pricing change.',
      rows: [{ month: 'April', revenue: 420_000 }],
      visualizationType: 'chart',
      confidence: 0.91,
      warnings: ['Correlation is not proof of causation.'],
      intent: {
        summary: 'Revenue by Month · line',
        confidence: 0.94,
        clarification: null,
      },
    })).toEqual({
      content: 'Revenue increased after the April pricing change.',
      data: [{ month: 'April', revenue: 420_000 }],
      visualizationType: 'chart',
      confidence: 0.91,
      intent: {
        summary: 'Revenue by Month · line',
        confidence: 0.94,
        clarification: null,
      },
      warnings: ['Correlation is not proof of causation.'],
      source: 'governed-ai',
    })
  })

  test('normalizes metric responses and clamps invalid confidence ranges', () => {
    expect(normalizeNaturalLanguageQueryResult({
      summary: 'Total governed revenue.',
      metric: { value: 125_000, label: 'Revenue', count: 42 },
      confidence: 2,
    })).toMatchObject({
      data: { metric: 125_000, label: 'Revenue', count: 42 },
      visualizationType: 'metric',
      confidence: 1,
    })
  })

  test('fails closed instead of inventing an answer', () => {
    expect(() => normalizeNaturalLanguageQueryResult({ rows: [{ value: 1 }] }))
      .toThrow('The AI query service returned no grounded answer.')
    expect(() => normalizeNaturalLanguageQueryResult(null))
      .toThrow('The AI query service returned an unsupported response.')
  })
})
