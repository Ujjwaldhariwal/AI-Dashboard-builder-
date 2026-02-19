'use client'

import { useDashboardStore } from '@/store/builder-store'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Plus, FolderKanban, Trash2, ExternalLink, Database, LayoutGrid } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

export default function WorkspacesPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const {
    dashboards,
    endpoints,
    widgets,
    addDashboard,
    removeDashboard,
    setCurrentDashboard,
  } = useDashboardStore()

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Fix hydration issue
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Dashboard name is required')
      return
    }

    const id = addDashboard({
      name: name.trim(),
      description: description.trim(),
      ownerId: user?.id || 'unknown', // now valid because Dashboard has ownerId?
    })

    setOpen(false)
    setName('')
    setDescription('')
    toast.success('Dashboard created')

    setCurrentDashboard(id)
    router.push('/builder')
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">My Dashboards</h1>
          <p className="text-muted-foreground">
            Welcome{user ? `, ${user.name}` : ''}. Create or edit AI dashboards for your projects.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Dashboard
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          {
            label: 'Dashboards',
            value: dashboards.length,
            icon: FolderKanban,
            color: 'from-blue-600 to-blue-500',
          },
          {
            label: 'Connected APIs',
            value: endpoints.length,
            icon: Database,
            color: 'from-purple-600 to-purple-500',
          },
          {
            label: 'Widgets',
            value: widgets.length,
            icon: LayoutGrid,
            color: 'from-green-600 to-green-500',
          },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center flex-shrink-0`}
                  >
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

      {/* Dashboard cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {dashboards.map((d) => (
          <Card key={d.id} className="flex flex-col">
            <CardHeader
              className="cursor-pointer"
              onClick={() => {
                setCurrentDashboard(d.id)
                router.push('/builder')
              }}
            >
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-blue-600" />
                {d.name}
              </CardTitle>
              <CardDescription>{d.description || 'No description'}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between items-center pt-0 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentDashboard(d.id)
                  router.push('/builder')
                }}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Open
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:text-red-700"
                onClick={() => {
                  if (confirm('Delete this dashboard?')) {
                    removeDashboard(d.id)
                    toast.success('Dashboard deleted')
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ))}

        {dashboards.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <FolderKanban className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No dashboards yet</h2>
              <p className="text-muted-foreground mb-4">
                Create your first AI-powered dashboard to get started.
              </p>
              <Button onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new dashboard</DialogTitle>
            <DialogDescription>
              This dashboard will be exportable as a standalone build for your client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MDM – City X Analytics"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description of this dashboard"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
