'use client'

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

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
    title: 'Assign project members',
    body: 'Give only selected members project-level lead, editor, or viewer access.',
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
  'Members see only assigned projects.',
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
      <section className="flex flex-col gap-4 border-b border-[color:var(--dos-border-soft)] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs text-[var(--dos-accent-primary)]">Tenant registry</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--dos-text-primary)]">Client isolation workbench</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--dos-text-muted)]">
            Establish the tenant boundary before assigning projects, data sources, members, and published dashboards.
          </p>
        </div>
        <div className="text-xs text-[var(--dos-text-muted)]"><strong className="font-mono text-lg text-[var(--dos-text-primary)]">{tenants.length}</strong> registered tenants</div>
      </section>

      <section className="overflow-hidden rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
        <div className="grid md:grid-cols-4 md:divide-x md:divide-[color:var(--dos-border-soft)]">
        {TENANT_FLOW.map((step) => {
          const Icon = step.icon
          return (
            <div key={step.title} className="border-b border-[color:var(--dos-border-soft)] p-4 last:border-b-0 md:border-b-0">
              <div className="flex items-center gap-2 text-[var(--dos-text-primary)]"><Icon className="h-4 w-4 text-[var(--dos-accent-primary)]" /><h3 className="text-sm font-semibold">{step.title}</h3></div>
              <p className="mt-2 text-xs leading-5 text-[var(--dos-text-muted)]">{step.body}</p>
            </div>
          )
        })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-[color:var(--dos-border-soft)]">
            <CardTitle className="text-sm">Tenant workspaces</CardTitle>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Tenant
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center border-b border-[color:var(--dos-border-soft)] py-10 text-sm text-[var(--dos-text-muted)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading tenants
              </div>
            ) : error ? (
              <div className="rounded-md border border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] p-4 text-sm text-[var(--dos-warning-text)]">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Tenant API is not ready</p>
                    <p className="mt-1 text-xs leading-5">
                      {error}
                    </p>
                    <p className="mt-2 text-xs">
                      Apply the DashboardOS tenancy migration before using this screen.
                    </p>
                  </div>
                </div>
              </div>
            ) : tenants.length > 0 ? (
              tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--dos-border-soft)] py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{tenant.name}</h3>
                      <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[var(--dos-text-secondary)]">
                        {tenant.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--dos-text-muted)]">
                      {tenant.primaryDomain || `${tenant.slug}.dashboardos.local`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs text-[var(--dos-text-muted)]">
                    <LockKeyhole className="h-3.5 w-3.5 text-[var(--dos-accent-primary)]" />
                    {tenant.slug}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-[color:var(--dos-border-soft)] p-6">
                <Building2 className="h-6 w-6 text-[var(--dos-text-muted)]" />
                <h3 className="mt-4 text-sm font-semibold">No tenants yet</h3>
                <p className="mt-1 max-w-md text-xs text-[var(--dos-text-muted)]">
                  Create the first client tenant after applying the tenancy migration.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-[var(--dos-success-text)]" />
              Access rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ACCESS_RULES.map((rule) => (
              <div key={rule} className="flex items-start gap-3 text-sm text-[var(--dos-text-muted)]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dos-success-text)]" />
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
