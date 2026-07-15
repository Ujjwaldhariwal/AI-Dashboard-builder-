import { Badge } from '@/components/ui/badge'
import { DataSourcesAdminPanel } from '@/components/platform/data-sources-admin-panel'

export default function DataSourcesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Badge className="bg-cyan-400 text-slate-950 hover:bg-cyan-400">Secure connection</Badge>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Data Sources</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Connect a tenant-scoped, read-only Postgres source. Credentials remain server-side and
          incomplete schema scans block semantic review.
        </p>
      </div>
      <DataSourcesAdminPanel />
    </div>
  )
}
