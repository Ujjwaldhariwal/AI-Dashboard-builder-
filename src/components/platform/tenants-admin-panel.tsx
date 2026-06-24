'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Building2, CheckCircle2, Globe2, KeyRound, Loader2, LockKeyhole, Plus, ShieldCheck, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Tenant } from '@/types/tenancy'

const TENANT_FLOW = [
  {
    title: 'Create tenant',
    body: 'Register the client workspace, slug, status, and branding shell.',
    icon: Building2,
  },
  {
    title: 'Attach domain',
    body: 'Map subdomain or custom hostname to the tenant resolver.',
    icon: Globe2,
  },
  {
    title: 'Assign engineers',
    body: 'Give only selected engineers project-level lead/editor/viewer access.',
    icon: KeyRound,
  },
  {
    title: 'Invite client users',
    body: 'Client users get tenant membership and read-only dashboard access.',
    icon: Users,
  },
]

const ACCESS_RULES = [
  'Platform admin can manage tenants and assignments.',
  'Engineer sees only assigned projects.',
  'Client viewer sees only published dashboards for their tenant.',
  'Builder APIs must check project assignment before writes.',
  'Client runtime must not expose database credentials or schemas.',
  'Every publish/report action should create an audit log entry.',
]

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

function errorToText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return 'Request failed'
}

export function TenantsAdminPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [primaryDomain, setPrimaryDomain] = useState('')

  const derivedSlug = useMemo(() => slug || slugify(name), [name, slug])

  const fetchTenants = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/tenants', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(errorToText(payload) || `Request failed (${response.status})`)
      }
      setTenants(Array.isArray(payload?.tenants) ? payload.tenants : [])
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchTenants()
  }, [])

  const resetCreateForm = () => {
    setName('')
    setSlug('')
    setPrimaryDomain('')
  }

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Tenant name is required')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          slug: derivedSlug,
          primaryDomain: primaryDomain.trim(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(errorToText(payload) || `Create failed (${response.status})`)
      }

      if (payload?.tenant) {
        setTenants(current => [payload.tenant as Tenant, ...current])
      }
      toast.success('Tenant created')
      setCreateOpen(false)
      resetCreateForm()
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-4">
        {TENANT_FLOW.map((step) => {
          const Icon = step.icon
          return (
            <Card key={step.title} className="border-white/10 bg-white/[0.03] text-slate-100">
              <CardContent className="p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{step.body}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm">Tenant workspaces</CardTitle>
            <Button size="sm" className="bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Tenant
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center rounded-lg border border-white/10 bg-slate-950/50 py-12 text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading tenants
              </div>
            ) : error ? (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Tenant API is not ready</p>
                    <p className="mt-1 text-xs leading-5 text-amber-100/75">
                      {error}
                    </p>
                    <p className="mt-2 text-xs text-amber-100/75">
                      Apply the DashboardOS tenancy migration before using this screen.
                    </p>
                  </div>
                </div>
              </div>
            ) : tenants.length > 0 ? (
              tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{tenant.name}</h3>
                      <Badge variant="outline" className="border-white/15 text-slate-300">
                        {tenant.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {tenant.primaryDomain || `${tenant.slug}.dashboardos.local`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <LockKeyhole className="h-3.5 w-3.5 text-cyan-300" />
                    {tenant.slug}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-slate-950/50 p-8 text-center">
                <Building2 className="mx-auto h-8 w-8 text-slate-500" />
                <h3 className="mt-3 text-sm font-semibold">No tenants yet</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Create the first client tenant after applying the tenancy migration.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Access rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ACCESS_RULES.map((rule) => (
              <div key={rule} className="flex items-start gap-3 text-sm text-slate-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{rule}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open)
        if (!open) resetCreateForm()
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create tenant</DialogTitle>
            <DialogDescription>
              Tenants are the client isolation boundary for dashboards, data sources, users, and reports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. UPPCL MDM" />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={derivedSlug} onChange={event => setSlug(slugify(event.target.value))} placeholder="uppcl-mdm" />
              <p className="text-[11px] text-muted-foreground">Used for tenant URLs and internal identifiers.</p>
            </div>
            <div className="space-y-2">
              <Label>Primary domain</Label>
              <Input value={primaryDomain} onChange={event => setPrimaryDomain(event.target.value)} placeholder="uppcl.dashboardos.local" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
