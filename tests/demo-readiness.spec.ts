import { expect, test } from '@playwright/test'

import {
  isDashboardOsDemoHost,
  shouldUseDashboardOsDemoRuntime,
} from '../src/lib/dashboardos/demo-mode'

test.describe('prepared demo access boundary', () => {
  test('allows localhost without enabling hosted demo mode', () => {
    expect(isDashboardOsDemoHost('localhost', false)).toBe(true)
    expect(isDashboardOsDemoHost('127.0.0.1', false)).toBe(true)
  })

  test('requires the explicit deployment flag on a hosted domain', () => {
    expect(isDashboardOsDemoHost('dashboardos.example.com', false)).toBe(false)
    expect(isDashboardOsDemoHost('dashboardos.example.com', true)).toBe(true)
  })

  test('requires authentication, the demo cookie, and an allowed reference slug', () => {
    const request = {
      hostname: 'dashboardos.example.com',
      cookieValue: '1',
      tenantSlug: 'northstar-retail',
      hostedDemoEnabled: true,
    }

    expect(shouldUseDashboardOsDemoRuntime({ ...request, isAuthenticated: true })).toBe(true)
    expect(shouldUseDashboardOsDemoRuntime({ ...request, isAuthenticated: false })).toBe(false)
    expect(shouldUseDashboardOsDemoRuntime({ ...request, cookieValue: undefined, isAuthenticated: true })).toBe(false)
    expect(shouldUseDashboardOsDemoRuntime({ ...request, tenantSlug: 'another-tenant', isAuthenticated: true })).toBe(false)
  })
})
