import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { resolveSafeInternalRedirect } from '../src/lib/auth/safe-redirect'
import { escapeTooltipHtml } from '../src/lib/echarts/safe-tooltip'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test.describe('release security regressions', () => {
  test('accepts only same-origin relative login redirects', () => {
    expect(resolveSafeInternalRedirect('/admin/charts?mode=review')).toBe('/admin/charts?mode=review')
    expect(resolveSafeInternalRedirect('javascript:alert(1)')).toBe('/admin')
    expect(resolveSafeInternalRedirect('//evil.example/path')).toBe('/admin')
    expect(resolveSafeInternalRedirect('/\\evil.example')).toBe('/admin')
  })

  test('encodes every HTML-significant tooltip character', () => {
    expect(escapeTooltipHtml(`<img src=x onerror="alert('x')">&`))
      .toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;')
  })

  test('keeps beta login invite-only and uses the safe redirect resolver', () => {
    const login = source('src/app/(auth)/login/page.tsx')
    expect(login).not.toContain('.auth.signUp(')
    expect(login).toContain('resolveSafeInternalRedirect')
    expect(login).toContain('router.replace(redirectTo)')
  })

  test('fails the Bosch proxy closed before credential forwarding', () => {
    const route = source('src/app/api/bosch/[...path]/route.ts')
    expect(route).toContain("process.env.BOSCH_PROXY_ENABLED !== 'true'")
    expect(route).toContain('getAuthedSupabase()')
    expect(route).toContain('checkRuntimeRateLimit({')
    expect(route).not.toContain('targetEnv:')
    expect(route).not.toContain("hint: 'Verify VPN")
  })

  test('encodes every chart tooltip that emits HTML', () => {
    for (const file of [
      'modern-area-chart.tsx',
      'modern-bar-chart.tsx',
      'modern-horizontal-bar-chart.tsx',
      'modern-line-chart.tsx',
      'modern-pie-chart.tsx',
    ]) {
      expect(source(`src/components/charts/${file}`)).toContain('escapeTooltipHtml')
    }
  })

  test('ships security headers and always-on release readiness', () => {
    const nextConfig = source('next.config.mjs')
    const workflow = source('.github/workflows/release-readiness.yml')
    expect(nextConfig).toContain('Content-Security-Policy')
    expect(nextConfig).toContain("frame-ancestors 'none'")
    expect(nextConfig).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(nextConfig).toContain('supabaseConnectionSources')
    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('Deterministic acceptance')
    expect(workflow).toContain('Live Supabase DB and authenticated E2E')
  })

  test('keeps the chart workbench inside responsive theme boundaries', () => {
    const panel = source('src/components/platform/dashboard-charts-admin-panel.tsx')
    expect(panel).toContain('2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,22rem)]')
    expect(panel).toContain('mt-3 flex flex-wrap gap-2')
    expect(panel).not.toContain('text-slate-100')
    expect(panel).not.toContain('border-white/10')
  })
})
