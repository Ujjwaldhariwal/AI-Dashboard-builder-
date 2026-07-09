'use client'

import { useEffect, useState, type CSSProperties } from 'react'

import { Button } from '@/components/ui/button'
import { AiChartRefinementDialog } from '@/components/platform/ai-chart-refinement-dialog'
import { DEMO_PROJECT_ID, DEMO_TENANT_ID, demoChart } from '@/lib/dashboardos/demo-data'
import type { DashboardChartConfig } from '@/types/dashboard-chart'

type HarnessTheme = 'dark' | 'light'

const DARK_VARS = {
  '--dos-background-deep': '#15171A',
  '--dos-background-base': '#1D2025',
  '--dos-surface': '#22272E',
  '--dos-surface-raised': '#2A2D32',
  '--dos-surface-muted': '#383B42',
  '--dos-text-primary': '#E6EDF3',
  '--dos-text-secondary': '#C9D1D9',
  '--dos-text-muted': '#A7B1BC',
  '--dos-border-soft': 'rgba(230, 237, 243, 0.08)',
  '--dos-border-mid': 'rgba(230, 237, 243, 0.14)',
  '--dos-card-overlay': 'rgba(34, 39, 46, 0.72)',
  '--dos-accent-primary': '#818CF8',
  '--dos-accent-primary-hover': '#A5B4FC',
  '--dos-accent-primary-soft': 'rgba(129, 140, 248, 0.12)',
  '--dos-success-soft': 'rgba(52, 211, 153, 0.12)',
  '--dos-warning-soft': 'rgba(251, 191, 36, 0.12)',
  '--dos-danger-soft': 'rgba(251, 113, 133, 0.12)',
  '--dos-info-soft': 'rgba(56, 189, 248, 0.12)',
  '--dos-chart-success': '#4ADE80',
  '--dos-chart-risk': '#FB7185',
  '--dos-chart-warning': '#FACC15',
  '--dos-chart-info': '#38BDF8',
} as CSSProperties

const LIGHT_VARS = {
  '--dos-background-deep': '#F7F8FA',
  '--dos-background-base': '#F7F8FA',
  '--dos-surface': '#FFFFFF',
  '--dos-surface-raised': '#FFFFFF',
  '--dos-surface-muted': '#F0F2F5',
  '--dos-text-primary': '#111827',
  '--dos-text-secondary': '#374151',
  '--dos-text-muted': '#4B5563',
  '--dos-border-soft': '#E5E7EB',
  '--dos-border-mid': '#D1D5DB',
  '--dos-card-overlay': '#FFFFFF',
  '--dos-accent-primary': '#4F46E5',
  '--dos-accent-primary-hover': '#4338CA',
  '--dos-accent-primary-soft': 'rgba(79, 70, 229, 0.10)',
  '--dos-success-soft': 'rgba(5, 150, 105, 0.10)',
  '--dos-warning-soft': 'rgba(217, 119, 6, 0.10)',
  '--dos-danger-soft': 'rgba(225, 29, 72, 0.10)',
  '--dos-info-soft': 'rgba(2, 132, 199, 0.10)',
  '--dos-chart-success': '#059669',
  '--dos-chart-risk': '#E11D48',
  '--dos-chart-warning': '#D97706',
  '--dos-chart-info': '#0284C7',
} as CSSProperties

export function AiChartRefinementVisualHarness() {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [theme, setTheme] = useState<HarnessTheme>('dark')
  const [chart, setChart] = useState<DashboardChartConfig>(demoChart)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setTheme(params.get('theme') === 'light' ? 'light' : 'dark')
    setReady(true)
  }, [])

  return (
    <main
      className="dashboardos-admin min-h-screen bg-[var(--dos-background-base)] p-8 text-[color:var(--dos-text-primary)]"
      data-dashboardos-theme={theme}
      style={theme === 'light' ? LIGHT_VARS : DARK_VARS}
    >
      <div className="mx-auto max-w-5xl rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dos-chart-info)]">Visual QA harness</p>
        <h1 className="mt-2 text-2xl font-semibold">AI chart refinement</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--dos-text-muted)]">
          Development-only surface for stable screenshot coverage. It renders the governed refinement dialog without enabling rollout for real users.
        </p>
        <Button
          type="button"
          className="mt-5 bg-[var(--dos-accent-primary)] text-[color:var(--dos-background-deep)] hover:bg-[var(--dos-accent-primary-hover)]"
          disabled={!ready}
          onClick={() => setOpen(true)}
        >
          Open refinement dialog
        </Button>
      </div>

      <AiChartRefinementDialog
        chart={chart}
        tenantId={DEMO_TENANT_ID}
        projectId={DEMO_PROJECT_ID}
        open={open}
        onOpenChange={setOpen}
        onApplied={setChart}
      />
    </main>
  )
}
