// src/app/(builder)/workspaces/page.tsx
'use client'

import { useDashboardStore } from '@/store/builder-store'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus, FolderKanban, Trash2, ExternalLink,
  Database, LayoutGrid, Search, Check, Pencil, X, Loader2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'

export default function WorkspacesPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const {
    dashboards, endpoints, widgets, isLoading,
    addDashboard, removeDashboard, updateDashboard,
    setCurrentDashboard, initialize,
  } = useDashboardStore()

  const [mounted, setMounted] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)

  useEffect(() => {
    setMounted(true)
    if (user?.id) {
      initialize(user.id)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!search.trim()) return dashboards
    const q = search.toLowerCase()
    return dashboards.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    )
  }, [dashboards, search])

  // ── Loading state ──
  if (!mounted || isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your dashboards...
        </p>
      </div>
    )
  }

  // ── Handlers (all async now) ──
  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    try {
      const id = await addDashboard({
        name: name.trim(),
        description: description.trim(),
        ownerId: user?.id || 'unknown',
      })
      setCreateOpen(false)
      setName('')
      setDescription('')
      toast.success('Dashboard created!')
      setCurrentDashboard(id)
      router.push('/builder')
    } catch {
      toast.error('Failed to create dashboard')
    }
  }

  const handleRenameConfirm = async (id: string) => {
    if (!renaming?.value.trim()) { toast.error('Name cannot be empty'); return }
    try {
      await updateDashboard(id, { name: renaming.value.trim() })
      toast.success('Renamed')
      setRenaming(null)
    } catch {
      toast.error('Failed to rename dashboard')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dashboard?')) return
    try {
      await removeDashboard(id)
      toast.success('Dashboard deleted')
    } catch {
      toast.error('Failed to delete dashboard')
    }
  }

  const widgetCountFor = (dashId: string) =>
    widgets.filter(w => w.dashboardId === dashId).length

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Dashboards</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Welcome{user ? `, ${user.name}` : ''}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="self-start sm:self-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Dashboard
        </Button>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Dashboards', value: dashboards.length, icon: FolderKanban, color: 'from-blue-600 to-blue-500' },
          { label: 'APIs',       value: endpoints.length,  icon: Database,     color: 'from-violet-600 to-violet-500' },
          { label: 'Widgets',    value: widgets.length,    icon: LayoutGrid,   color: 'from-emerald-600 to-emerald-500' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search dashboards..."
          className="pl-8 h-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {search && (
        <p className="text-xs text-muted-foreground mb-4">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
        </p>
      )}

      {/* ── Dashboard cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(d => (
          <Card key={d.id} className="flex flex-col group hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                {renaming?.id === d.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      className="h-7 text-sm font-semibold"
                      autoFocus
                      value={renaming.value}
                      onChange={e => setRenaming({ id: d.id, value: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameConfirm(d.id)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 flex-shrink-0" onClick={() => handleRenameConfirm(d.id)}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => setRenaming(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FolderKanban className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <CardTitle
                      className="text-base truncate cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => { setCurrentDashboard(d.id); router.push('/builder') }}
                    >
                      {d.name}
                    </CardTitle>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={e => { e.stopPropagation(); setRenaming({ id: d.id, value: d.name }) }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
              <CardDescription className="text-xs mt-1 truncate">
                {d.description || 'No description'}
              </CardDescription>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  {widgetCountFor(d.id)} widget{widgetCountFor(d.id) !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {/* ✅ Fixed: d.created_at (DB column) not d.createdAt */}
                  {new Date(d.created_at).toLocaleDateString()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4 flex justify-between items-center mt-auto">
              <Button
                variant="default" size="sm"
                onClick={() => { setCurrentDashboard(d.id); router.push('/builder') }}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => handleDelete(d.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ))}

        {dashboards.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-14 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
                <FolderKanban className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No dashboards yet</h2>
              <p className="text-muted-foreground text-sm mb-4">Create your first dashboard to get started.</p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {dashboards.length > 0 && filtered.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No dashboards match "{search}".{' '}
              <button className="text-blue-500 hover:underline ml-1" onClick={() => setSearch('')}>
                Clear search
              </button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Dashboard</DialogTitle>
            <DialogDescription>Give it a name so you can find it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={name}
                autoFocus
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Sales Analytics Q1"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional short description"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
