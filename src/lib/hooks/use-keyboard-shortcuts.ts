import { useEffect } from 'react'

export function useKeyboardShortcuts(
  isEditing: boolean,
  onSave: () => void,
  onExit: () => void
) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+S to save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        if (isEditing) {
          onSave()
        }
      }

      // Escape to exit edit mode
      if (e.key === 'Escape' && isEditing) {
        onExit()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isEditing, onSave, onExit])
}
