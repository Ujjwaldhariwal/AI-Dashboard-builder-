'use client'

import { useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/store/auth-store'

export function SessionExpiredModal() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const logout = useAuthStore(state => state.logout)
  const showModal = useAuthStore(
    state => state.authIssue === 'expired' && state.showSessionExpiredModal,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const returnTo = useMemo(() => {
    const query = searchParams.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])

  const handleRelogin = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    const target = `/login?returnTo=${encodeURIComponent(returnTo)}`
    await logout(target)
  }

  return (
    <AlertDialog open={showModal}>
      <AlertDialogContent
        className="max-w-md border-border/70 bg-background/95 backdrop-blur-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Session Expired</AlertDialogTitle>
          <AlertDialogDescription>
            Your session expired. Please log in again to continue seeing charts/data.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogAction
            onClick={handleRelogin}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Redirecting...' : 'Log in again'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
