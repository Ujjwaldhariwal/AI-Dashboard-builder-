'use client'

// src/components/layout/notification-bell.tsx

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Bell, X, CheckCircle2, AlertCircle,
  Info, AlertTriangle, ExternalLink, Check,
} from 'lucide-react'
import { useNotificationStore } from '@/store/notification-store'
import { useMonitoringStore } from '@/store/monitoring-store'
import { useDashboardStore } from '@/store/builder-store'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

const typeIcon = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error:   AlertCircle,
  info:    Info,
}

const typeColor = {
  success: 'text-green-600',
  warning: 'text-amber-500',
  error:   'text-red-600',
  info:    'text-blue-600',
}

const typeBg = {
  success: 'bg-green-50 dark:bg-green-950/30',
  warning: 'bg-amber-50 dark:bg-amber-950/30',
  error:   'bg-red-50 dark:bg-red-950/30',
  info:    'bg-blue-50 dark:bg-blue-950/30',
}

export function NotificationBell() {
  const router   = useRouter()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    notifications, addNotification, markAllRead,
    dismiss, clearAll, unreadCount,
  } = useNotificationStore()

  const { logs, getErrorCount }    = useMonitoringStore()
  const { dashboards, endpoints, widgets } = useDashboardStore()

  const unread = unreadCount()

  // ── Auto-generate system notifications from app state ──────────────────
  useEffect(() => {
    const errorCount = getErrorCount()
    if (errorCount > 0) {
      // Only add if not already notified about this count
      const existing = notifications.find(
        n => n.id === `sys-errors-${errorCount}`,
      )
      if (!existing) {
        addNotification({
          type:    'error',
          title:   `${errorCount} widget error${errorCount > 1 ? 's' : ''} detected`,
          message: 'Open Monitoring to view details',
          link:    '/monitoring',
        })
      }
    }
  }, [logs.length])

  useEffect(() => {
    if (endpoints.length === 0 && dashboards.length > 0) {
      const existing = notifications.find(n => n.id === 'sys-no-apis')
      if (!existing) {
        addNotification({
          type:    'warning',
          title:   'No APIs connected',
          message: 'Add a data source to start building widgets',
          link:    '/api-config',
        })
      }
    }
  }, [endpoints.length])

  useEffect(() => {
    if (widgets.length > 0) {
      const existing = notifications.find(n => n.id === `sys-widgets-${widgets.length}`)
      if (!existing) {
        addNotification({
          type:    'success',
          title:   `${widgets.length} widget${widgets.length > 1 ? 's' : ''} active`,
          message: 'Your dashboard is live with real data',
        })
      }
    }
  }, [widgets.length])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    setOpen(v => !v)
  }

  const handleNotifClick = (notif: typeof notifications[0]) => {
    if (notif.link) {
      router.push(notif.link)
      setOpen(false)
    }
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={handleOpen}
      >
        <Bell className={`w-4 h-4 ${unread > 0 ? 'text-primary' : ''}`} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold"
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-80 z-50"
          >
            <Card className="shadow-xl border">
              <CardHeader className="px-4 pt-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Notifications</CardTitle>
                  <div className="flex items-center gap-1">
                    {unread > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-muted-foreground gap-1"
                        onClick={markAllRead}
                      >
                        <Check className="w-3 h-3" />
                        Mark all read
                      </Button>
                    )}
                    {notifications.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-muted-foreground"
                        onClick={clearAll}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-2 pb-3 max-h-[400px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">All caught up!</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <AnimatePresence initial={false}>
                      {notifications.map(notif => {
                        const Icon = typeIcon[notif.type]
                        return (
                          <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg transition-colors group cursor-pointer ${
                              !notif.read ? typeBg[notif.type] : 'hover:bg-muted/50'
                            }`}
                            onClick={() => handleNotifClick(notif)}
                          >
                            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${typeColor[notif.type]}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className={`text-xs font-medium ${!notif.read ? 'font-semibold' : ''}`}>
                                  {notif.title}
                                </p>
                                {!notif.read && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                {notif.message}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] text-muted-foreground/70">
                                  {timeAgo(notif.timestamp)}
                                </p>
                                {notif.link && (
                                  <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    View
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              onClick={e => { e.stopPropagation(); dismiss(notif.id) }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
