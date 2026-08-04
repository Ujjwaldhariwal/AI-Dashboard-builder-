import { expect, test } from '@playwright/test'

import {
  isReactDevToolsChildrenSetError,
  shouldIgnoreDevelopmentConsoleError,
} from '../src/lib/observability/development-console-filter'

const message =
  'The children should not have changed if we pass in the same set.'

function diagnostic(stack: string) {
  const error = new Error(message)
  error.stack = stack
  return ['Warning: React instrumentation encountered an error:', error]
}

test.describe('development console filtering', () => {
  test('recognizes the React DevTools extension invariant', () => {
    const values = diagnostic(
      `Error: ${message}\n    at updateFiberRecursively (chrome-extension://fmkadmapgofadopljbjfkapdkoienihi/build/installHook.js:1:121140)`,
    )

    expect(isReactDevToolsChildrenSetError(values)).toBe(true)
    expect(shouldIgnoreDevelopmentConsoleError(values, 'development')).toBe(true)
  })

  test('does not hide the same message from application code', () => {
    const values = diagnostic(
      `Error: ${message}\n    at updateDashboard (http://localhost:3000/_next/static/chunks/app.js:1:100)`,
    )

    expect(isReactDevToolsChildrenSetError(values)).toBe(false)
    expect(shouldIgnoreDevelopmentConsoleError(values, 'development')).toBe(false)
  })

  test('never filters production console errors', () => {
    const values = diagnostic(
      `Error: ${message}\n    at updateFiberRecursively (chrome-extension://fmkadmapgofadopljbjfkapdkoienihi/build/installHook.js:1:121140)`,
    )

    expect(shouldIgnoreDevelopmentConsoleError(values, 'production')).toBe(false)
  })
})
