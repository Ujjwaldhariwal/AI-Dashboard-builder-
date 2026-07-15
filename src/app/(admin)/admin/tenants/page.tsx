import { Badge } from '@/components/ui/badge'
import { TenantsAdminPanel } from '@/components/platform/tenants-admin-panel'

export default function TenantsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div>
          <Badge className="bg-cyan-400 text-slate-950 hover:bg-cyan-400">Governed access</Badge>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Tenants</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Tenant management is the security boundary for DashboardOS. Every dashboard, data source,
            dataset, report, and client route resolves through this layer.
          </p>
        </div>
      </div>
      <TenantsAdminPanel />
    </div>
  )
}
