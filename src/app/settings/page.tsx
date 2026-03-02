'use client'

// src/app/(builder)/settings/page.tsx

import { useState, useEffect } from 'react'
import {
  Card, CardContent, CardHeader,
  CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/store/auth-store'
import { useDashboardStore } from '@/store/builder-store'
import { toast } from 'sonner'
import {
  User, Shield, Database, Trash2,
  LogOut, Sun, Save, ArrowLeft,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { user, logout } = useAuthStore()
  const { dashboards, endpoints, widgets, removeDashboard } = useDashboardStore()
  const router = useRouter()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [darkMode, setDarkMode] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [clearOpen, setClearOpen] = useState(false)  // ✅ AlertDialog state

  useEffect(() => {
    setDarkMode(localStorage.getItem('theme') === 'dark')
  }, [])

  const handleDarkModeToggle = (v: boolean) => {
    setDarkMode(v)
    document.documentElement.classList.toggle('dark', v)
    localStorage.setItem('theme', v ? 'dark' : 'light')
    toast.info(v ? '🌙 Dark mode on' : '☀️ Light mode on')
  }

  const handleSaveProfile = () => toast.success('Profile saved')

  const handleClearAllData = () => {
    // ✅ clone array first — store mutates in place
    ;[...dashboards].forEach(d => removeDashboard(d.id))
    setClearOpen(false)
    toast.success('All data cleared')
  }

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <div className="p-6">
      <div className="w-full max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost" size="icon"
            onClick={() => router.back()}
            className="h-9 w-9 rounded-xl border hover:bg-muted flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold mb-0.5">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account and application preferences
            </p>
          </div>
        </div>

        {/* Profile */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm">Profile</CardTitle>
                <CardDescription className="text-xs">Update your personal info</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input className="h-8 text-sm" value={name}
                  onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input className="h-8 text-sm" value={email} type="email"
                  onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveProfile}>
                <Save className="w-3.5 h-3.5 mr-1.5" />Save Profile
              </Button>
              {user?.emp_id && (
                <Badge variant="outline" className="text-xs font-mono">{user.emp_id}</Badge>
              )}
              {user?.role && (
                <Badge variant="secondary" className="text-xs capitalize">{user.role}</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                <Sun className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm">Preferences</CardTitle>
                <CardDescription className="text-xs">App behaviour and display</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {[
              { label: 'Dark Mode', desc: 'Toggle dark/light theme', checked: darkMode, onChange: handleDarkModeToggle },
              { label: 'Notifications', desc: 'Show toast alerts for widget events', checked: notifications, onChange: setNotifications },
              { label: 'Auto-refresh widgets', desc: 'Refresh data based on endpoint interval', checked: autoRefresh, onChange: setAutoRefresh },
            ].map(pref => (
              <div key={pref.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">{pref.desc}</p>
                </div>
                <Switch checked={pref.checked} onCheckedChange={pref.onChange} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Data Usage */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center">
                <Database className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm">Data Usage</CardTitle>
                <CardDescription className="text-xs">Your current project stats</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Dashboards', value: dashboards.length, color: 'text-blue-600' },
                { label: 'APIs', value: endpoints.length, color: 'text-purple-600' },
                { label: 'Widgets', value: widgets.length, color: 'text-green-600' },
              ].map(stat => (
                <div key={stat.label} className="p-3 rounded-lg bg-muted/50 border text-center">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm">Security</CardTitle>
                <CardDescription className="text-xs">Account actions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <div>
                <p className="text-sm font-medium">Logged in as</p>
                <p className="text-xs text-muted-foreground">{user?.email ?? 'Unknown'}</p>
              </div>
              <Badge variant="secondary" className="text-xs">Active</Badge>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
              <LogOut className="w-3.5 h-3.5 mr-1.5" />Logout
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm text-red-600">Danger Zone</CardTitle>
                <CardDescription className="text-xs">Irreversible actions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Clear all data</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  Deletes all dashboards, APIs, and widgets permanently
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setClearOpen(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Clear All
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ✅ Clear all confirm — no window.confirm */}
      <AlertDialog open={clearOpen} onOpenChange={(v: boolean) => !v && setClearOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {dashboards.length} dashboard{dashboards.length !== 1 ? 's' : ''},
              {' '}{endpoints.length} API{endpoints.length !== 1 ? 's' : ''}, and
              {' '}{widgets.length} widget{widgets.length !== 1 ? 's' : ''}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleClearAllData}
            >
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
