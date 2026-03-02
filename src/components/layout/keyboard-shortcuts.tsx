'use client'

// src/components/layout/keyboard-shortcuts.tsx

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { group: 'Navigation',
    items: [
      { keys: ['G', 'W'], desc: 'Go to Workspaces' },
      { keys: ['G', 'B'], desc: 'Go to Builder' },
      { keys: ['G', 'A'], desc: 'Go to API Config' },
      { keys: ['G', 'M'], desc: 'Go to Monitoring' },
      { keys: ['G', 'S'], desc: 'Go to Settings' },
    ],
  },
  { group: 'Builder',
    items: [
      { keys: ['N'],       desc: 'New widget' },
      { keys: ['⌘', 'K'],  desc: 'Focus search' },
      { keys: ['R'],       desc: 'Refresh all widgets' },
      { keys: ['E'],       desc: 'Toggle AI assistant' },
    ],
  },
  { group: 'General',
    items: [
      { keys: ['?'],       desc: 'Show this shortcuts panel' },
      { keys: ['Esc'],     desc: 'Close dialog / panel' },
      { keys: ['⌘', 'Z'],  desc: 'Undo (browser)' },
    ],
  },
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded border border-border bg-muted text-[11px] font-mono font-semibold shadow-sm">
      {children}
    </kbd>
  )
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.key === '?') setOpen(v => !v)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-4 h-4" />
            Keyboard Shortcuts
            <Badge variant="outline" className="text-[10px] ml-auto font-mono">?</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {SHORTCUTS.map(group => (
            <div key={group.group}>
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.group}
              </h3>
              <div className="space-y-1.5">
                {group.items.map(item => (
                  <div key={item.desc} className="flex items-center justify-between">
                    <span className="text-sm">{item.desc}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground text-center pt-2 border-t">
          Press <Kbd>?</Kbd> anywhere to toggle this panel
        </p>
      </DialogContent>
    </Dialog>
  )
}
