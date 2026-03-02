'use client'

// src/app/(builder)/workspaces/page.tsx

import { useDashboardStore } from '@/store/builder-store'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, FolderKanban, Trash2, ExternalLink,
  Database, LayoutGrid, Copy, Search,
  CalendarDays, Eye, Pencil, Check, X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

const GRADIENTS = [
  'from-blue-600 to-purple-600',
  'from-purple-600 to-pink-600',
  'from-green-600 to-teal-600',
  'from-orange-500 to-red-600',
  'from-cyan-500 to-blue-600',
  'from-indigo-600 to-violet-600',
]

// ── Inline rename input ───────────────────────────────────────────────────────
function InlineRename({
  value,
  onSave,
  onCancel,
}: {
  value:    string
  onSave:   (v: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) { toast.error('Name cannot be empty'); return }
    if (trimmed === value) { onCancel(); return }
    onSave(trimmed)
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
      <Input
        ref={inputRef}
        className="h-7 text-sm font-semibold px-2 flex-1 min-w-0"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  commit()
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={commit}
      />
      <button
        className="p-1 rounded hover:bg-green-100 text-green-600 dark:hover:bg-green-950/30 flex-shrink-0"
        onMouseDown={e => { e.preventDefault(); commit() }}
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"
        onMouseDown={e => { e.preventDefault(); onCancel() }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export default function WorkspacesPage() {
  const router   = useRouter()
  const { user } = useAuthStore()
  const {
    dashboards, endpoints, widgets,
    addDashboard, removeDashboard, updateDashboard,
    setCurrentDashboard, duplicateDashboard,
  } = useDashboardStore()

  const [mounted, setMounted]          = useState(false)
  const [createOpen, setCreateOpen]    = useState(false)
  const [deleteId, setDeleteId]        = useState<string | null>(null)
  const [renamingId, setRenamingId]    = useState<string | null>(null)  // ✅ inline rename
  const [name, setName]                = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch]            = useState('')

  useEffect(() => { setMounted(true) }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return dashboards
    const q = search.toLowerCase()
    return dashboards.filter(
      d => d.name.toLowerCase().includes(q) ||
           (d.description ?? '').toLowerCase().includes(q),
    )
  }, [dashboards, search])

  if (!mounted) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!name.trim()) { toast.error('Dashboard name is required'); return }
    const id = addDashboard({
      name:        name.trim(),
      description: description.trim(),
      ownerId:     user?.id || 'unknown',
    })
    setCreateOpen(false)
    setName('')
    setDescription('')
    toast.success('Dashboard created')
    setCurrentDashboard(id)
    router.push('/builder')
  }

  const handleRename = (id: string, newName: string) => {
    updateDashboard(id, { name: newName })
    setRenamingId(null)
    toast.success('Dashboard renamed')
  }

  const handleDuplicate = (d: typeof dashboards[0]) => {
    const newId = duplicateDashboard(d.id)
    if (!newId) return
    toast.success(`"${d.name}" duplicated`)
    setCurrentDashboard(newId)
    router.push('/builder')
  }

  const confirmDelete = () => {
    if (!deleteId) return
    removeDashboard(deleteId)
    setDeleteId(null)
    toast.success('Dashboard deleted')
  }

  const getWidgetCount   = (id: string) => widgets.filter(w => w.dashboardId === id).length
  const getEndpointCount = (id: string) =>
    endpoints.filter(e => widgets.some(w => w.dashboardId === id && w.endpointId === e.id)).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">My Dashboards</h1>
          <p className="text-sm text-muted-foreground">
            Welcome{user ? `, ${user.name}` : ''}. Manage your AI-powered dashboards.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />New Dashboard
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Dashboards',     value: dashboards.length, icon: FolderKanban, color: 'from-blue-600 to-blue-500' },
          { label: 'Connected APIs', value: endpoints.length,  icon: Database,     color: 'from-purple-600 to-purple-500' },
          { label: 'Widgets',        value: widgets.length,    icon: LayoutGrid,   color: 'from-green-600 to-green-500' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Search */}
      {dashboards.length > 2 && (
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search dashboards..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Dashboard cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {filtered.map((d, idx) => {
            const widgetCount   = getWidgetCount(d.id)
            const endpointCount = getEndpointCount(d.id)
            const gradient      = GRADIENTS[idx % GRADIENTS.length]
            const createdDate   = d.createdAt ? new Date(d.createdAt).toLocaleDateString() : null
            const isRenaming    = renamingId === d.id

            return (
              <motion.div
                key={d.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
              >
                <Card className="flex flex-col hover:shadow-md transition-shadow overflow-hidden">
                  <div className={`h-1.5 w-full bg-gradient-to-r ${gradient}`} />

                  <CardHeader
                    className={`pb-2 ${!isRenaming ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (isRenaming) return
                      setCurrentDashboard(d.id)
                      router.push('/builder')
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <FolderKanban className="w-4 h-4 text-white" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* ✅ Inline rename — swaps title for input */}
                        {isRenaming ? (
                          <InlineRename
                            value={d.name}
                            onSave={v => handleRename(d.id, v)}
                            onCancel={() => setRenamingId(null)}
                          />
                        ) : (
                          <div className="flex items-center gap-1 group/title">
                            <CardTitle className="text-sm truncate flex-1">{d.name}</CardTitle>
                            <button
                              className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-muted transition-all flex-shrink-0"
                              title="Rename"
                              onClick={e => {
                                e.stopPropagation()
                                setRenamingId(d.id)
                              }}
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </div>
                        )}
                        <CardDescription className="text-xs truncate mt-0.5">
                          {d.description || 'No description'}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        <LayoutGrid className="w-2.5 h-2.5 mr-1" />
                        {widgetCount} widget{widgetCount !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        <Database className="w-2.5 h-2.5 mr-1" />
                        {endpointCount} API{endpointCount !== 1 ? 's' : ''}
                      </Badge>
                      {createdDate && (
                        <Badge variant="outline" className="text-[10px] px-1.5 hidden sm:flex">
                          <CalendarDays className="w-2.5 h-2.5 mr-1" />
                          {createdDate}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 pb-3 px-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm" className="h-7 text-xs flex-1"
                        onClick={() => { setCurrentDashboard(d.id); router.push('/builder') }}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />Open
                      </Button>
                      <Link href="/dashboard">
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => setCurrentDashboard(d.id)}
                        >
                          <Eye className="w-3 h-3 mr-1" />View
                        </Button>
                      </Link>
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0"
                        title="Duplicate" onClick={() => handleDuplicate(d)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Delete" onClick={() => setDeleteId(d.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filtered.length === 0 && dashboards.length > 0 && (
          <div className="col-span-full py-12 text-center">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No dashboards match "{search}"</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearch('')}>
              Clear search
            </Button>
          </div>
        )}

        {dashboards.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
                <FolderKanban className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-semibold mb-2">No dashboards yet</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first AI-powered dashboard to get started.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />Create dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new dashboard</DialogTitle>
            <DialogDescription>
              This dashboard will be exportable as a standalone build for your client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. MDM — City X Analytics"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Short description of this dashboard"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v: boolean) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the dashboard and all its widgets. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
