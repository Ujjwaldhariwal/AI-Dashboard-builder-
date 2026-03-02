// Module: UseKeyboardShortcuts
import { useEffect, useCallback } from 'react'

interface ShortcutHandlers {
  onNewWidget?: () => void     // Ctrl+N
  onExport?: () => void        // Ctrl+E
  onRefresh?: () => void       // Ctrl+R
  onHelp?: () => void          // ?
  onSearch?: () => void        // Ctrl+K
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handle = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

    // Ctrl+N → new widget (skip in inputs)
    if (e.ctrlKey && e.key === 'n' && !isInput) {
      e.preventDefault()
      handlers.onNewWidget?.()
    }

    // Ctrl+E → export
    if (e.ctrlKey && e.key === 'e' && !isInput) {
      e.preventDefault()
      handlers.onExport?.()
    }

    // Ctrl+K → search focus
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault()
      handlers.onSearch?.()
    }

    // Ctrl+R → refresh all
    if (e.ctrlKey && e.key === 'r' && !isInput) {
      e.preventDefault()
      handlers.onRefresh?.()
    }

    // ? → help (skip in inputs)
    if (e.key === '?' && !isInput) {
      handlers.onHelp?.()
    }
  }, [handlers])

  useEffect(() => {
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [handle])
}
