'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Database, Eye, Loader2, Search, Table2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DataSource, DataSourceRelationSelectionStatus, DataSourceSchemaInventory } from '@/types/data-source'

function errorText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).error === 'string') {
    return String((value as Record<string, unknown>).error)
  }
  return 'Request failed'
}

export function SchemaInventoryDialog({
  source,
  open,
  onOpenChange,
  onConfirmed,
}: {
  source: DataSource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmed: () => Promise<void> | void
}) {
  const [inventory, setInventory] = useState<DataSourceSchemaInventory | null>(null)
  const [decisions, setDecisions] = useState<Record<string, DataSourceRelationSelectionStatus>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!source) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/data-sources/${source.id}/schema-inventory`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorText(payload))
      const next = payload?.inventory as DataSourceSchemaInventory
      setInventory(next)
      setDecisions(Object.fromEntries(next.relations.filter(relation => relation.available).map(relation => [relation.id, relation.selectionStatus])))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [source])

  useEffect(() => {
    if (open) void load()
  }, [load, open])

  const visibleRelations = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (inventory?.relations ?? []).filter(relation => relation.available && (!term
      || `${relation.schemaName}.${relation.relationName} ${relation.columns.map(column => column.name).join(' ')}`.toLowerCase().includes(term)))
  }, [inventory, search])

  const reviewCount = Object.values(decisions).filter(status => status === 'review').length
  const includedCount = Object.values(decisions).filter(status => status === 'included').length

  const applyRecommendations = () => {
    if (!inventory) return
    setDecisions(Object.fromEntries(inventory.relations.filter(relation => relation.available).map(relation => [
      relation.id,
      relation.classification === 'business_candidate' ? 'included' : 'excluded',
    ])))
  }

  const confirm = async () => {
    if (!source || !inventory?.inventoryHash) return
    if (reviewCount > 0) {
      toast.error(`Decide whether to include or exclude all ${reviewCount} remaining object(s).`)
      return
    }
    if (includedCount === 0) {
      toast.error('Include at least one business table.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/data-sources/${source.id}/schema-selection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryHash: inventory.inventoryHash,
          decisions: inventory.relations.filter(relation => relation.available).map(relation => ({
            relationId: relation.id,
            status: decisions[relation.id],
          })),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorText(payload))
      setInventory(payload.inventory as DataSourceSchemaInventory)
      toast.success(`${includedCount} analytics object${includedCount === 1 ? '' : 's'} confirmed`)
      await onConfirmed()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const summary = inventory?.summary

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Review fetched database objects</DialogTitle>
          <DialogDescription>
            {source ? `${source.name} · ${(source.connectionConfig.schemas?.length ? source.connectionConfig.schemas : ['public']).join(', ')}` : 'Data source'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading exact schema inventory
          </div>
        ) : inventory && summary ? (
          <div className="flex min-h-0 flex-col">
            <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4 lg:grid-cols-8">
              {[
                ['Objects', summary.discoveredObjectCount],
                ['Tables', summary.discoveredTableCount],
                ['Views', summary.discoveredViewCount],
                ['Columns', summary.discoveredColumnCount],
                ['Included', includedCount],
                ['Excluded', Object.values(decisions).filter(status => status === 'excluded').length],
                ['Review', reviewCount],
                ['Scope', reviewCount > 0 ? 'Pending' : 'Ready'],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-background px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
              <div className="relative min-w-56 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Search tables, views, or columns" />
              </div>
              <Button type="button" variant="outline" onClick={applyRecommendations}>Use recommendations</Button>
            </div>

            {inventory.reviewRequired && summary.scopeStatus === 'confirmed' && reviewCount === 0 ? (
              <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-xs text-amber-700 dark:text-amber-200">
                This source uses a compatibility scope that kept previously discovered objects included. Review the exact inventory and confirm the intended business tables.
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <div className="space-y-2">
                {visibleRelations.map(relation => {
                  const status = decisions[relation.id] ?? 'review'
                  return (
                    <details key={relation.id} className="rounded-lg border bg-card">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                        {relation.relationType.includes('view') ? <Eye className="h-4 w-4 text-sky-500" /> : <Table2 className="h-4 w-4 text-indigo-500" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-sm font-medium">{relation.schemaName}.{relation.relationName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{relation.relationType.replace(/_/g, ' ')} · {relation.columnCount} columns · {relation.reason}</p>
                        </div>
                        <Badge variant="outline">{relation.classification.replace(/_/g, ' ')}</Badge>
                        <div className="flex gap-1" onClick={event => event.preventDefault()}>
                          <Button
                            type="button"
                            size="sm"
                            variant={status === 'included' ? 'default' : 'outline'}
                            onClick={() => setDecisions(current => ({ ...current, [relation.id]: 'included' }))}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Include
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={status === 'excluded' ? 'destructive' : 'outline'}
                            onClick={() => setDecisions(current => ({ ...current, [relation.id]: 'excluded' }))}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Exclude
                          </Button>
                        </div>
                      </summary>
                      <div className="border-t px-4 py-3">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {relation.columns.map(column => (
                            <div key={column.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs">
                              <span className="truncate font-mono">{column.name}</span>
                              <span className="shrink-0 text-muted-foreground">{column.dataType}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
              <p className="text-xs text-muted-foreground">
                <Database className="mr-1 inline h-3.5 w-3.5" />
                Only included objects will be available to semantic models and datasets.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={confirm} disabled={saving || reviewCount > 0 || includedCount === 0}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirm analytics scope
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 py-12 text-sm text-muted-foreground">No schema inventory is available. Run introspection first.</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
