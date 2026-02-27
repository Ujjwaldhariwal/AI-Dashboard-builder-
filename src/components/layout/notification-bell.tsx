'use client'

// Component: NotificationBell

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'

type NotifType = 'success' | 'warning' | 'info'

interface Notification {
  id: string
  type: NotifType
  title: string
  message: string
  time: string
  read: boolean
}

const typeIcon = {
  success: CheckCircle2,
  warning: AlertCircle,
  info: Info,
}

const typeColor = {
  success: 'text-green-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
}

export function NotificationBell() {
  const { dashboards, endpoints, widgets } = useDashboardStore()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])

  // Auto-generate notifications based on state
  const allNotifs: Notification[] = [
    endpoints.length === 0 && {
      id: 'no-apis',
      type: 'warning' as NotifType,
      title: 'No APIs connected',
      message: 'Add a data source to start building widgets',
      time: 'Now',
      read: false,
    },
    dashboards.length > 0 && widgets.length === 0 && {
      id: 'no-widgets',
      type: 'info' as NotifType,
      title: 'No widgets yet',
      message: 'Test an API endpoint and add a chart widget',
      time: 'Now',
      read: false,
    },
    widgets.length > 0 && {
      id: 'widgets-active',
      type: 'success' as NotifType,
      title: `${widgets.length} widget${widgets.length > 1 ? 's' : ''} active`,
      message: 'Your dashboard is live with real data',
      time: 'Now',
      read: false,
    },
    dashboards.length > 0 && {
      id: 'dashboard-ready',
      type: 'success' as NotifType,
      title: 'Dashboard ready',
      message: `"${dashboards[dashboards.length - 1]?.name}" is configured`,
      time: 'Recently',
      read: false,
    },
  ].filter(Boolean).filter(n => n && !dismissed.includes(n.id)) as Notification[]

  const unread = allNotifs.filter(n => !n.read).length

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={() => setOpen(o => !o)}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center"
          >
            {unread}
          </Badge>
        )}
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <Card className="absolute right-0 top-10 w-80 z-50 shadow-xl border">
            <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm">Notifications</CardTitle>
              {allNotifs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground"
                  onClick={() => setDismissed(allNotifs.map(n => n.id))}
                >
                  Clear all
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-2 pb-3">
              {allNotifs.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">All caught up!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {allNotifs.map(notif => {
                    const Icon = typeIcon[notif.type]
                    return (
                      <div
                        key={notif.id}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${typeColor[notif.type]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{notif.title}</p>
                          <p className="text-[11px] text-muted-foreground">{notif.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{notif.time}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={() => setDismissed(d => [...d, notif.id])}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
