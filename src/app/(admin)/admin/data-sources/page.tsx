import { Badge } from '@/components/ui/badge'
import { DataSourcesAdminPanel } from '@/components/platform/data-sources-admin-panel'

export default function DataSourcesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Badge className="bg-cyan-400 text-slate-950 hover:bg-cyan-400">Sprint 3</Badge>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Data Sources</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          This screen replaces API-first setup with secure tenant-scoped database sources.
          The first supported source is Postgres so the platform can prove safety and speed before expanding.
        </p>
      </div>
      <DataSourcesAdminPanel />
    </div>
  )
}
