'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, Clock3, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  clearBuilderDemoAuthSession,
  getBuilderDemoAuthSession,
  getBuilderDemoAuthTokenMeta,
} from '@/lib/auth/demo-auth-session'

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return {
      value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      format: 'hh:mm:ss' as const,
    }
  }

  return {
    value: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    format: 'mm:ss' as const,
  }
}

export function TokenSessionTimer() {
  const [session, setSession] = useState(() => getBuilderDemoAuthSession())
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const syncSession = () => {
      setSession(getBuilderDemoAuthSession())
      setNowMs(Date.now())
    }

    window.addEventListener('builderDemoAuthSessionChanged', syncSession)
    return () => window.removeEventListener('builderDemoAuthSessionChanged', syncSession)
  }, [])

  useEffect(() => {
    if (!session?.token) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [session?.token])

  const tokenMeta = session?.token
    ? getBuilderDemoAuthTokenMeta(session.token, nowMs)
    : null

  const countdown = tokenMeta?.remainingMs !== null && tokenMeta?.remainingMs !== undefined
    ? formatRemainingTime(tokenMeta.remainingMs)
    : null
  const timerWidthClass = countdown?.format === 'hh:mm:ss' ? 'min-w-[88px]' : 'min-w-[72px]'

  if (!session?.token || !tokenMeta) return null

  const isExpiringSoon = !tokenMeta.isExpired
    && typeof tokenMeta.remainingMs === 'number'
    && tokenMeta.remainingMs <= 5 * 60 * 1000

  const wrapperClass = tokenMeta.isExpired
    ? 'border-red-300 bg-red-50 text-red-700'
    : isExpiringSoon
      ? 'border-amber-300 bg-amber-50 text-amber-700'
      : 'border-emerald-300 bg-emerald-50 text-emerald-700'

  return (
    <>
      <Link
        href="/auth-flow"
        className={`md:hidden h-8 w-8 rounded-md border flex items-center justify-center ${wrapperClass}`}
        title={tokenMeta.isExpired ? 'Token expired' : 'Token session status'}
      >
        {tokenMeta.isExpired ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
      </Link>

      <div className={`hidden md:flex items-center gap-2 px-2.5 h-8 rounded-md border ${wrapperClass}`}>
        {tokenMeta.isExpired ? (
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
        )}

        <div className="leading-none">
          <p className="text-[10px] uppercase tracking-wide font-semibold">
            {tokenMeta.isExpired ? 'Session Expired' : 'Token Session'}
          </p>
          <p className="text-[11px] font-medium flex items-center gap-1.5">
            {tokenMeta.isExpired
              ? 'Re-login required'
              : countdown
                ? (
                    <>
                      <span>Expires in</span>
                      <span
                        className={`inline-block text-right font-mono tabular-nums ${timerWidthClass}`}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {countdown.value}
                      </span>
                    </>
                  )
                : 'Active (no exp claim)'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {tokenMeta.isExpired ? (
            <>
              <button
                type="button"
                className="text-[10px] underline underline-offset-2"
                onClick={() => clearBuilderDemoAuthSession()}
              >
                clear
              </button>
              <Badge variant="outline" className="text-[9px] border-current text-current">
                Re-login
              </Badge>
            </>
          ) : (
            <Badge variant="outline" className="text-[9px] border-current text-current">
              Active
            </Badge>
          )}
        </div>
      </div>
    </>
  )
}
