import { Calendar, Download, Filter, LayoutDashboard, LockKeyhole, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const CHARTS = [
  { title: 'Monthly Revenue', value: 'Awaiting publish', type: 'Line chart slot' },
  { title: 'Customer Mix', value: 'Awaiting publish', type: 'Donut chart slot' },
  { title: 'Operational Aging', value: 'Awaiting publish', type: 'Bar chart slot' },
  { title: 'SLA Summary', value: 'Awaiting publish', type: 'KPI table slot' },
]

export default async function TenantClientPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  const tenantName = tenantSlug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Client'

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{tenantName}</p>
              <h1 className="truncate text-lg font-semibold">Published Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex">
              Read-only
            </Badge>
            <Button variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" className="bg-slate-950 text-white hover:bg-slate-800">
              <Download className="mr-2 h-4 w-4" />
              PDF Report
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Client dashboard runtime</h2>
              <p className="mt-1 text-xs text-slate-500">
                This route is the future tenant-specific read-only surface. Builder controls stay out of this experience.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                Date Range
              </Button>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {CHARTS.map((chart) => (
            <Card key={chart.title} className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{chart.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{chart.type}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{chart.value}</Badge>
                </div>
                <div className="mt-4 flex h-56 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50">
                  <div className="text-center">
                    <LockKeyhole className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-xs text-slate-500">Published widget data will render here</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  )
}
