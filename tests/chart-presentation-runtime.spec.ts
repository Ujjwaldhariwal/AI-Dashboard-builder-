import { expect, test } from '@playwright/test'

import {
  dashboardChartPresentationToWidgetStyle,
  normalizeDashboardChartPresentation,
} from '../src/lib/charts/dashboard-chart-presentation'
import {
  formatCategoryAxisLabel,
  formatChartLabel,
  formatChartText,
  getChartDensityLayout,
} from '../src/lib/charts/chart-constants'
import { formatChartNumber } from '../src/lib/echarts/style-translator'
import { formatAuxiliaryTooltipRows, formatTooltipHtmlLabel } from '../src/lib/echarts/safe-tooltip'

const dateFieldId = '10000000-0000-4000-8000-000000000001'
const revenueMetricId = '20000000-0000-4000-8000-000000000001'

const presentation = normalizeDashboardChartPresentation({
  size: 'wide',
  showLegend: true,
  showLabels: true,
  showGrid: false,
  density: 'compact',
  xAxis: {
    labelFontWeight: 'medium',
    labelRotation: 20,
    labelFormat: 'month-year',
    labelLocale: 'en-IN',
    labelTimeZone: 'preserve',
    labelOverflow: 'truncate',
    labelMaxLength: 14,
  },
  yAxis: {
    labelFontWeight: 'bold',
    numberFormat: {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 1,
    },
  },
  legend: {
    labelFontSize: 12,
    labelFontWeight: 'medium',
    labelOverflow: 'truncate',
    labelMaxLength: 16,
    labelOverrides: [{ targetId: revenueMetricId, label: 'Net revenue' }],
  },
  tooltip: {
    labelOverflow: 'wrap',
    labelMaxLength: 20,
    labelOverrides: [{ targetId: revenueMetricId, label: 'Net revenue billed' }],
    numberFormat: { style: 'compact', maximumFractionDigits: 1 },
  },
  labels: {
    numberFormat: { style: 'decimal', maximumFractionDigits: 2 },
    collision: 'hide-overlap',
  },
})

test.describe('chart presentation runtime', () => {
  test('derives the renderer style from the canonical grammar', () => {
    const style = dashboardChartPresentationToWidgetStyle(
      presentation,
      ['#4F46E5'],
      {
        templateId: 'line',
        labelById: {
          [dateFieldId]: 'Recorded At',
          [revenueMetricId]: 'Revenue',
        },
      },
    )

    expect(style).toMatchObject({
      showGrid: false,
      density: 'compact',
      xAxisLabelFontWeight: 'medium',
      xAxisLabelRotation: 20,
      xAxisLabelFormat: 'month-year',
      xAxisLabelLocale: 'en-IN',
      xAxisLabelTimeZone: 'preserve',
      xAxisLabelOverflow: 'truncate',
      xAxisLabelMaxLength: 14,
      yAxisLabelFontWeight: 'bold',
      yAxisNumberFormat: { style: 'currency', currency: 'INR' },
      legendLabelOverrides: { Revenue: 'Net revenue' },
      tooltipLabelOverrides: { Revenue: 'Net revenue billed' },
      tooltipNumberFormat: { style: 'compact' },
      valueLabelNumberFormat: { style: 'decimal' },
      labelCollision: 'hide-overlap',
    })
    expect(Object.values(style).some(value => typeof value === 'function')).toBe(false)
  })

  test('filters renderer settings that a template does not support', () => {
    const pieStyle = dashboardChartPresentationToWidgetStyle(
      presentation,
      ['#4F46E5'],
      {
        templateId: 'pie',
        labelById: { [revenueMetricId]: 'Revenue' },
      },
    )
    expect(pieStyle.showGrid).toBeUndefined()
    expect(pieStyle.xAxisLabelFormat).toBeUndefined()
    expect(pieStyle.legendLabelOverrides).toBeUndefined()
    expect(pieStyle.tooltipLabelOverrides).toBeUndefined()
    expect(pieStyle.legendLabelOverflow).toBe('truncate')
    expect(pieStyle.tooltipNumberFormat).toMatchObject({ style: 'compact' })

    const horizontalStyle = dashboardChartPresentationToWidgetStyle(
      normalizeDashboardChartPresentation({
        size: 'wide',
        showLegend: false,
        showLabels: true,
        density: 'spacious',
        xAxis: {
          labelRotation: 20,
          numberFormat: { style: 'compact', maximumFractionDigits: 1 },
        },
        yAxis: {
          labelOverflow: 'wrap',
          labelMaxLength: 18,
        },
        legend: {
          labelOverrides: [{ targetId: revenueMetricId, label: 'Net revenue' }],
        },
      }),
      ['#4F46E5'],
      {
        templateId: 'horizontal-bar',
        labelById: { [revenueMetricId]: 'Revenue' },
      },
    )
    expect(horizontalStyle.xAxisLabelRotation).toBeUndefined()
    expect(horizontalStyle.xAxisLabelFormat).toBeUndefined()
    expect(horizontalStyle.legendLabelOverrides).toBeUndefined()
    expect(horizontalStyle.xAxisNumberFormat).toMatchObject({ style: 'compact' })
    expect(horizontalStyle.yAxisLabelOverflow).toBe('wrap')
  })

  test('formats approved dates without accepting formatter strings', () => {
    const timestamp = '2026-07-31T23:30:00-05:00'
    expect(formatCategoryAxisLabel(timestamp, 'date-only', 'en-US', 'preserve')).toBe('07/31/2026')
    expect(formatCategoryAxisLabel(timestamp, 'date-only', 'en-US', 'UTC')).toBe('08/01/2026')
    expect(formatCategoryAxisLabel(timestamp, 'month-short', 'en-US', 'preserve')).toBe('Jul')
    expect(formatCategoryAxisLabel(timestamp, 'month-year', 'en-US', 'preserve')).toBe('Jul 2026')
    expect(formatCategoryAxisLabel(timestamp, 'year', 'en-US', 'preserve')).toBe('2026')
    expect(formatCategoryAxisLabel('not-a-date', 'date-only', 'en-US', 'UTC')).toBe('not-a-date')
  })

  test('formats typed numbers with fixed Intl options', () => {
    expect(formatChartNumber(12345.67, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 1,
    })).toBe('₹12,345.7')
    expect(formatChartNumber(0.125, {
      style: 'percent',
      percentScale: 'fraction',
      maximumFractionDigits: 1,
    })).toBe('12.5%')
    expect(formatChartNumber(12.5, {
      style: 'percent',
      percentScale: 'whole',
      maximumFractionDigits: 1,
    })).toBe('12.5%')
    expect(formatChartNumber(1_250_000, {
      style: 'compact',
      maximumFractionDigits: 1,
    })).toBe('1.3M')
  })

  test('applies aliases and overflow before escaping tooltip HTML', () => {
    expect(formatChartText('A very long legend label', 'truncate', 12)).toBe('A very long…')
    expect(formatChartText('A long label that should wrap cleanly', 'wrap', 12)).toContain('\n')
    expect(formatChartLabel('Revenue', { Revenue: 'Net revenue' })).toBe('Net revenue')
    expect(formatTooltipHtmlLabel(
      'Revenue',
      { Revenue: 'Net <revenue>' },
      'truncate',
      30,
    )).toBe('Net &lt;revenue&gt;')
  })

  test('renders bounded auxiliary tooltip rows with governed aliases and escaping', () => {
    const rows = formatAuxiliaryTooltipRows({
      row: {
        Region: '<APAC>',
        Score: 12345,
        Revenue: 999,
      },
      fields: ['Region', 'Score', 'Region', 'Revenue'],
      excludedFields: ['Revenue'],
      style: {
        colors: ['#4F46E5'],
        tooltipLabelOverrides: { Region: 'Market' },
        tooltipLabelOverflow: 'truncate',
        tooltipLabelMaxLength: 20,
        tooltipNumberFormat: { style: 'compact', maximumFractionDigits: 1 },
      },
    })

    expect(rows).toBe('Market: <strong>&lt;APAC&gt;</strong><br/>Score: <strong>12.3K</strong>')
    expect(rows).not.toContain('Revenue')
  })

  test('maps density to bounded renderer-owned spacing', () => {
    expect(getChartDensityLayout('compact')).toMatchObject({
      axisLabelMargin: 6,
      legendItemGap: 8,
      barCategoryGap: '50%',
    })
    expect(getChartDensityLayout('spacious')).toMatchObject({
      axisLabelMargin: 14,
      legendItemGap: 18,
      barCategoryGap: '25%',
    })
  })
})
