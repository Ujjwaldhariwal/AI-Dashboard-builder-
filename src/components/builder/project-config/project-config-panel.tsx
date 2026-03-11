//src//components/builder/project-config/project-config-panel.tsx
'use client'

import { useState } from 'react'
import { useDashboardStore } from '@/store/builder-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Building2, Shield, Layout, RotateCcw,
  Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AuthStrategy, LayoutType, EncodingType, NavDensity } from '@/types/project-config'

interface Props {
  dashboardId: string
}

export function ProjectConfigPanel({ dashboardId }: Props) {
  const store = useDashboardStore()
  const {
    getProjectConfig, setProjectConfig, resetProjectConfig,
    getGroupsByDashboard, addChartGroup, removeChartGroup,
    updateChartGroup, reorderGroups, assignWidgetToGroup,
    getWidgetsByDashboard,
  } = store

  const config  = getProjectConfig(dashboardId)
  const groups  = getGroupsByDashboard(dashboardId)
  const widgets = getWidgetsByDashboard(dashboardId)
  const [newGroupName, setNewGroupName] = useState('')

  // Generic field updater — supports dot notation e.g. "login.endpoint"
  const update = (path: string, value: any) => {
    const keys = path.split('.')
    if (keys.length === 1) {
      setProjectConfig(dashboardId, { [keys[0]]: value } as any)
    } else {
      const [parent, child] = keys
      setProjectConfig(dashboardId, {
        [parent]: { ...(config as any)[parent], [child]: value },
      } as any)
    }
  }

  const handleReset = () => {
    resetProjectConfig(dashboardId)
    toast.success('Project config reset to defaults')
  }

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return
    addChartGroup(dashboardId, newGroupName.trim())
    setNewGroupName('')
    toast.success(`Group "${newGroupName.trim()}" added`)
  }

  const handleAssign = (widgetId: string, groupId: string) => {
    assignWidgetToGroup(widgetId, groupId)
    const w = widgets.find(w => w.id === widgetId)
    const g = groups.find(g => g.id === groupId)
    toast.success(`"${w?.title}" added to ${g?.name}`)
  }

  const handleUnassign = (widgetId: string) => {
    assignWidgetToGroup(widgetId, null)
  }

  // Safe nested value reader for dot-path
  const getNestedVal = (path: string): string => {
    return path.split('.').reduce((o: any, k) => o?.[k], config) ?? ''
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 py-3 border-b bg-blue-500/5 flex-shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">Project Configuration</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Configures the generated ZIP project
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="project" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="mx-3 mt-2 flex-shrink-0 grid grid-cols-3">
          <TabsTrigger value="project" className="text-[10px] gap-1">
            <Building2 className="w-3 h-3" />Project
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-[10px] gap-1">
            <Shield className="w-3 h-3" />Auth
          </TabsTrigger>
          <TabsTrigger value="groups" className="text-[10px] gap-1">
            <Layout className="w-3 h-3" />Groups
          </TabsTrigger>
        </TabsList>

        {/* ── Project Tab ──────────────────────────────────── */}
        <TabsContent value="project" className="flex-1 overflow-y-auto px-4 py-3 space-y-4 mt-0">
          <Field label="Client / Company Name">
            <Input
              value={config.clientName}
              onChange={e => update('clientName', e.target.value)}
              placeholder="e.g. UPPCL, Bosch"
              className="h-8 text-xs"
            />
          </Field>

          <Field label="Dashboard Title">
            <Input
              value={config.projectTitle}
              onChange={e => {
                update('projectTitle', e.target.value)
                update('header.projectName', e.target.value)
              }}
              placeholder="MDM Dashboard"
              className="h-8 text-xs"
            />
          </Field>

          <Field label="Header Subtitle">
            <Input
              value={config.header.subtitle ?? ''}
              onChange={e => update('header.subtitle', e.target.value)}
              placeholder="e.g. Smart Meter Monitoring Platform"
              className="h-8 text-xs"
            />
          </Field>

          <Field label="API Base URL">
            <Input
              value={config.baseUrl}
              onChange={e => update('baseUrl', e.target.value)}
              placeholder="https://api.yourproject.com"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Layout Type">
            <Select
              value={config.layout}
              onValueChange={v => update('layout', v as LayoutType)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sidebar">Sidebar (recommended)</SelectItem>
                <SelectItem value="topnav">Top Navbar</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Navigation Density">
            <Select
              value={config.header.navDensity ?? 'comfortable'}
              onValueChange={v => update('header.navDensity', v as NavDensity)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Brand Colors */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Brand Colors</Label>
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label="Sidebar BG"
                value={config.header.primaryColor}
                onChange={v => update('header.primaryColor', v)}
              />
              <ColorField
                label="Accent"
                value={config.header.accentColor}
                onChange={v => update('header.accentColor', v)}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Auth Tab ─────────────────────────────────────── */}
        <TabsContent value="auth" className="flex-1 overflow-y-auto px-4 py-3 space-y-4 mt-0">
          <Field label="Auth Strategy">
            <Select
              value={config.authStrategy}
              onValueChange={v => update('authStrategy', v as AuthStrategy)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic Auth (username + password)</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="api-key">API Key</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Login Endpoint">
            <Input
              value={config.login.endpoint}
              onChange={e => update('login.endpoint', e.target.value)}
              placeholder="/userLogin"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Username Field (body key)">
            <Input
              value={config.login.usernameField}
              onChange={e => update('login.usernameField', e.target.value)}
              placeholder="username"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Password Field (body key)">
            <Input
              value={config.login.passwordField}
              onChange={e => update('login.passwordField', e.target.value)}
              placeholder="password"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Token Path (dot-notation)">
            <Input
              value={config.login.tokenPath}
              onChange={e => update('login.tokenPath', e.target.value)}
              placeholder="data.token"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Where in the login response is the token — e.g. <code>data.token</code>
            </p>
          </Field>

          <Field label="Credential Encoding">
            <Select
              value={config.login.encodingType}
              onValueChange={v => update('login.encodingType', v as EncodingType)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">Plain (send as-is)</SelectItem>
                <SelectItem value="btoa">btoa (base64 encode user:pass)</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-2 pt-1">
            <Label className="text-xs font-semibold">Session Expiry</Label>
            <div className="rounded-lg border divide-y">
              <div className="flex items-center justify-between px-3 py-2.5">
                <Label className="text-xs">Auto-logout on 401</Label>
                <Switch
                  checked={config.session.logoutOn401}
                  onCheckedChange={v => update('session.logoutOn401', v)}
                />
              </div>
            </div>
            <Field label="Logout on response message containing">
              <Input
                value={config.session.logoutOnMessage}
                onChange={e => update('session.logoutOnMessage', e.target.value)}
                placeholder="expired"
                className="h-8 text-xs font-mono"
              />
            </Field>
          </div>
        </TabsContent>

        {/* ── Groups Tab ───────────────────────────────────── */}
        <TabsContent value="groups" className="flex-1 overflow-y-auto px-4 py-3 mt-0 space-y-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Groups become sidebar sections in the output dashboard.
          </p>

          {/* Add group input */}
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="e.g. Disconnection, Prepaid Billing"
              className="h-8 text-xs flex-1"
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
            />
            <Button
              size="sm"
              className="h-8 px-2.5"
              onClick={handleAddGroup}
              disabled={!newGroupName.trim()}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Empty state */}
          {groups.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground border-2 border-dashed rounded-lg">
              No groups yet. Add one above to organize charts into sidebar sections.
            </div>
          )}

          {/* Groups list */}
          <div className="space-y-3">
            {groups.map(group => {
              const groupWidgets   = widgets.filter(w => w.groupId === group.id)
              const unassigned     = widgets.filter(w => !w.groupId)

              return (
                <div key={group.id} className="rounded-lg border bg-card p-3 space-y-2">

                  {/* Group header row */}
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={group.name}
                      onChange={e => updateChartGroup(group.id, { name: e.target.value })}
                      className="h-6 text-xs flex-1 border-0 bg-transparent p-0 focus-visible:ring-0 font-medium"
                    />
                    <Badge variant="outline" className="text-[9px] flex-shrink-0">
                      {groupWidgets.length} charts
                    </Badge>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => reorderGroups(dashboardId, group.id, 'up')}>
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => reorderGroups(dashboardId, group.id, 'down')}>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-5 w-5 text-destructive hover:text-destructive"
                        onClick={() => { removeChartGroup(group.id); toast.success('Group removed') }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Assigned widgets */}
                  {groupWidgets.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t">
                      {groupWidgets.map(w => (
                        <div key={w.id}
                          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          <span className="max-w-[100px] truncate">{w.title}</span>
                          <button
                            onClick={() => handleUnassign(w.id)}
                            className="hover:text-destructive ml-0.5 flex-shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick-add unassigned widgets */}
                  {unassigned.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-[9px] text-muted-foreground mb-1.5">
                        + Add unassigned:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {unassigned.map(w => (
                          <button
                            key={w.id}
                            onClick={() => handleAssign(w.id, group.id)}
                            className="text-[9px] px-2 py-0.5 rounded-full border border-dashed hover:bg-muted hover:border-solid transition-all truncate max-w-[120px]"
                          >
                            + {w.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Unassigned warning */}
          {widgets.filter(w => !w.groupId).length > 0 && groups.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                {widgets.filter(w => !w.groupId).length} widget
                {widgets.filter(w => !w.groupId).length !== 1 ? 's' : ''} unassigned
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                These appear under "All Charts" in the output sidebar.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function ColorField({
  label, value, onChange,
}: {
  label:    string
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <label className="flex items-center gap-2 cursor-pointer group">
        <div
          className="w-7 h-7 rounded-md border-2 border-border flex-shrink-0 group-hover:border-primary transition-colors"
          style={{ backgroundColor: value }}
        />
        <span className="text-[10px] font-mono text-muted-foreground">{value}</span>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="sr-only"
        />
      </label>
    </div>
  )
}
