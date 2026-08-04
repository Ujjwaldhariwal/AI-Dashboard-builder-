import { expect, test } from '@playwright/test'

import { validateChartAiPatchAgainstAllowlist } from '../src/lib/ai/chart-ai-contract'
import { DashboardChartPresentationPatchSchema } from '../src/lib/charts/dashboard-chart-presentation'
import {
  validateDashboardChartConfig,
  validateDashboardChartPresentationPatch,
} from '../src/lib/semantic/chart-config-validator'
import { CHART_TEMPLATE_REGISTRY } from '../src/lib/semantic/chart-template-registry'
import type { DashboardChartPresentationPatch } from '../src/lib/charts/dashboard-chart-presentation'
import type { DashboardChartConfig, DashboardChartEncoding } from '../src/types/dashboard-chart'

const dateFieldId = '10000000-0000-4000-8000-000000000001'
const categoryFieldId = '10000000-0000-4000-8000-000000000002'
const revenueMetricId = '20000000-0000-4000-8000-000000000001'
const ordersMetricId = '20000000-0000-4000-8000-000000000002'

const fields = [
  { id: dateFieldId, name: 'Month', role: 'date' },
  { id: categoryFieldId, name: 'Region', role: 'dimension' },
]
const metrics = [
  { id: revenueMetricId, name: 'Revenue', aggregation: 'sum' },
  { id: ordersMetricId, name: 'Orders', aggregation: 'count' },
]

function encoding(xAxisFieldId = dateFieldId): DashboardChartEncoding {
  return {
    xAxisFieldId,
    yMetricIds: [revenueMetricId],
    stackMetricIds: [],
    tooltipFieldIds: [xAxisFieldId, revenueMetricId],
    labelById: {},
    colorById: {},
    filters: [],
  }
}

function chart(templateId: DashboardChartConfig['templateId'] = 'line'): DashboardChartConfig {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    tenantId: '40000000-0000-4000-8000-000000000001',
    projectId: '50000000-0000-4000-8000-000000000001',
    datasetId: '60000000-0000-4000-8000-000000000001',
    name: 'Revenue trend',
    status: 'draft',
    templateId,
    encoding: encoding(),
    presentation: {
      size: 'wide',
      showLegend: true,
      showLabels: false,
    },
    interactions: {},
    layout: { order: 0, gridSpan: 2 },
    validationState: 'valid',
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  }
}

function issueCodes(
  templateId: string,
  presentation: DashboardChartPresentationPatch,
  chartEncoding = encoding(),
) {
  return validateDashboardChartPresentationPatch({
    templateId,
    presentation,
    encoding: chartEncoding,
    fields,
    metrics,
  }).map(issue => issue.code)
}

test.describe('chart presentation schema and capabilities', () => {
  test('accepts the bounded Phase 1 presentation grammar', () => {
    const result = DashboardChartPresentationPatchSchema.safeParse({
      density: 'comfortable',
      showGrid: false,
      xAxis: {
        labelFontWeight: 'medium',
        labelRotation: 15,
        labelFormat: 'date-only',
        labelLocale: 'en-IN',
        labelTimeZone: 'preserve',
        labelOverflow: 'truncate',
        labelMaxLength: 20,
      },
      yAxis: {
        numberFormat: {
          style: 'currency',
          currency: 'INR',
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
          useGrouping: true,
        },
      },
      legend: {
        labelOverflow: 'truncate',
        labelMaxLength: 24,
        labelOverrides: [{ targetId: revenueMetricId, label: 'Revenue' }],
      },
      tooltip: {
        labelOverrides: [{ targetId: revenueMetricId, label: 'Total revenue' }],
        numberFormat: { style: 'compact', maximumFractionDigits: 1 },
      },
      labels: {
        numberFormat: { style: 'decimal', maximumFractionDigits: 1 },
        collision: 'hide-overlap',
      },
    })

    expect(result.success).toBe(true)
  })

  test('rejects arbitrary and internally inconsistent formatting', () => {
    expect(DashboardChartPresentationPatchSchema.safeParse({
      xAxis: { labelFormat: 'DD/MM/YYYY' },
    }).success).toBe(false)
    expect(DashboardChartPresentationPatchSchema.safeParse({
      yAxis: { numberFormat: { style: 'currency' } },
    }).success).toBe(false)
    expect(DashboardChartPresentationPatchSchema.safeParse({
      yAxis: { numberFormat: { style: 'percent' } },
    }).success).toBe(false)
    expect(DashboardChartPresentationPatchSchema.safeParse({
      yAxis: {
        labelFormat: 'date-only',
        numberFormat: { style: 'decimal' },
      },
    }).success).toBe(false)
    expect(DashboardChartPresentationPatchSchema.safeParse({
      legend: { labelOverflow: 'truncate' },
    }).success).toBe(false)
    expect(DashboardChartPresentationPatchSchema.safeParse({
      tooltip: {
        labelOverrides: [
          { targetId: revenueMetricId, label: 'Revenue' },
          { targetId: revenueMetricId, label: 'Revenue again' },
        ],
      },
    }).success).toBe(false)
  })

  test('declares presentation capabilities for every chart template', () => {
    expect(CHART_TEMPLATE_REGISTRY.length).toBeGreaterThan(0)
    for (const template of CHART_TEMPLATE_REGISTRY) {
      expect(template.supports.presentation).toBeTruthy()
      expect(Array.isArray(template.supports.presentation.axes.dateFormat)).toBe(true)
      expect(typeof template.supports.presentation.grid).toBe('boolean')
      expect(typeof template.supports.presentation.density).toBe('boolean')
    }
  })

  test('allows the planned line and bar presentation features', () => {
    const presentation = {
      showGrid: false,
      density: 'compact',
      xAxis: {
        labelFormat: 'date-only',
        labelFontWeight: 'medium',
        labelRotation: 15,
        labelOverflow: 'truncate',
        labelMaxLength: 20,
      },
      yAxis: {
        numberFormat: { style: 'compact' },
      },
      legend: {
        labelOverrides: [{ targetId: revenueMetricId, label: 'Revenue' }],
      },
      tooltip: {
        labelOverrides: [{ targetId: revenueMetricId, label: 'Total revenue' }],
        numberFormat: { style: 'decimal', maximumFractionDigits: 1 },
      },
    } satisfies DashboardChartPresentationPatch

    expect(issueCodes('line', presentation)).toEqual([])
    expect(issueCodes('bar', presentation)).toEqual([])
  })

  test('rejects capabilities unsupported by horizontal bar, pie, and KPI cards', () => {
    expect(issueCodes('horizontal-bar', {
      xAxis: { labelRotation: 15 },
      legend: {
        labelOverrides: [{ targetId: revenueMetricId, label: 'Revenue' }],
      },
    })).toEqual(expect.arrayContaining([
      'unsupported_axis_rotation',
      'unsupported_legend_overrides',
    ]))

    expect(issueCodes('pie', {
      showGrid: false,
      xAxis: { labelFormat: 'date-only' },
      legend: {
        labelOverrides: [{ targetId: revenueMetricId, label: 'Revenue' }],
      },
    })).toEqual(expect.arrayContaining([
      'unsupported_grid',
      'unsupported_axis',
      'unsupported_legend_overrides',
    ]))

    expect(issueCodes('kpi-card', {
      showGrid: false,
      showLegend: false,
      tooltip: { enabled: false },
    })).toEqual(expect.arrayContaining([
      'unsupported_grid',
      'unsupported_legend',
      'unsupported_tooltip',
    ]))
  })

  test('requires date axes and governed override targets', () => {
    expect(issueCodes('bar', {
      xAxis: { labelFormat: 'date-only' },
    }, encoding(categoryFieldId))).toContain('date_format_requires_date_field')

    expect(issueCodes('bar', {
      legend: {
        labelOverrides: [{ targetId: ordersMetricId, label: 'Orders' }],
      },
    })).toContain('invalid_legend_override_target')

    expect(issueCodes('bar', {
      tooltip: {
        labelOverrides: [{ targetId: categoryFieldId, label: 'Region' }],
      },
    })).toContain('invalid_tooltip_override_target')
  })

  test('includes new semantic presentation failures in full chart validation', () => {
    const result = validateDashboardChartConfig({
      templateId: 'line',
      encoding: encoding(),
      presentation: {
        size: 'wide',
        showLegend: true,
        showLabels: false,
        legend: {
          labelOverrides: [{ targetId: ordersMetricId, label: 'Orders' }],
        },
      },
      fields,
      metrics,
    })

    expect(result.state).toBe('invalid')
    expect(result.issues.map(issue => issue.code)).toContain('invalid_legend_override_target')
  })

  test('enforces presentation capabilities through the existing AI patch validator', () => {
    const result = validateChartAiPatchAgainstAllowlist({
      currentChart: chart('pie'),
      patch: { presentation: { showGrid: false } },
      allowedFieldIds: new Set([dateFieldId]),
      allowedMetricIds: new Set([revenueMetricId]),
      fields,
      metrics,
    })

    expect(result.ok).toBe(false)
    expect(result.validation?.issues.map(issue => issue.code)).toContain('unsupported_grid')
  })

  test('blocks presentation override targets outside the AI allowlist', () => {
    const result = validateChartAiPatchAgainstAllowlist({
      currentChart: chart(),
      patch: {
        presentation: {
          tooltip: {
            labelOverrides: [{ targetId: dateFieldId, label: 'Month' }],
          },
        },
      },
      allowedFieldIds: new Set(),
      allowedMetricIds: new Set([revenueMetricId]),
      fields,
      metrics,
    })

    expect(result.ok).toBe(false)
    expect(result.blockedIds).toContain(dateFieldId)
  })
})
