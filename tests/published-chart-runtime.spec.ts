import { expect, test } from '@playwright/test'

import {
  publishedDashboardDisplayName,
  resolvePublishedChartFields,
} from '../src/lib/client/published-chart-runtime'

test('removes automation timestamps from the displayed dashboard title', () => {
  expect(publishedDashboardDisplayName('Electricity Operations Command Center 20260707062439'))
    .toBe('Electricity Operations Command Center')
  expect(publishedDashboardDisplayName('Executive Revenue'))
    .toBe('Executive Revenue')
})

test('keeps exact runtime field names from a published chart result', () => {
  expect(resolvePublishedChartFields({
    fieldNames: ['Month', 'Total Units Consumed'],
    rows: [{ Month: 'Jan', 'Total Units Consumed': '120' }],
    requestedXField: 'Month',
    requestedYFields: ['Total Units Consumed'],
  })).toMatchObject({
    xField: 'Month',
    yFields: ['Total Units Consumed'],
  })
})

test('reconciles saved labels with runtime aliases', () => {
  expect(resolvePublishedChartFields({
    fieldNames: ['billing_month', 'total_units_consumed'],
    rows: [{ billing_month: 'Jan', total_units_consumed: 120 }],
    requestedXField: 'Billing Month',
    requestedYFields: ['Total Units Consumed'],
    requestedSortField: 'TOTAL UNITS CONSUMED',
  })).toEqual({
    xField: 'billing_month',
    yFields: ['total_units_consumed'],
    tooltipFields: [],
    sortField: 'total_units_consumed',
  })
})

test('infers a dimension and numeric metrics when saved labels are stale', () => {
  expect(resolvePublishedChartFields({
    fieldNames: ['region', 'units', 'bill_amount'],
    rows: [{ region: 'North', units: '1,200', bill_amount: 98.5 }],
    requestedXField: 'Old region label',
    requestedYFields: ['Missing metric'],
  })).toMatchObject({
    xField: 'region',
    yFields: ['units', 'bill_amount'],
  })
})
