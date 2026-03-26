'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShieldCheck, Clock, XCircle } from 'lucide-react'
import {
  clearBuilderDemoAuthSession,
  getBuilderDemoAuthSession,
  getBuilderDemoAuthTokenMeta,
} from '@/lib/auth/demo-auth-session'

function formatCountdown(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (h > 0)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type ChipState = 'active' | 'warning' | 'expired'

const CHIP_CONFIG: Record<
  ChipState,
  {
    bar: string
    border: string
    bg: string
    icon: React.ReactNode
    iconColor: string
    eyebrow: string
    eyebrowColor: string
    valueColor: string
    dot: string
    pillText?: string
  }
> = {
  active: {
    bar: 'bg-[#1D9E75]',
    border: 'border-[#5DCAA5]',
    bg: 'bg-[#F2FBF7]',
    icon: <ShieldCheck className="w-[13px] h-[13px]" />,
    iconColor: 'text-[#0F6E56]',
    eyebrow: 'Token session',
    eyebrowColor: 'text-[#085041]',
    valueColor: 'text-[#0F6E56]',
    dot: 'bg-[#1D9E75]',
  },
  warning: {
    bar: 'bg-[#BA7517]',
    border: 'border-[#FAC775]',
    bg: 'bg-[#FEF8EE]',
    icon: <Clock className="w-[13px] h-[13px]" />,
    iconColor: 'text-[#854F0B]',
    eyebrow: 'Token session',
    eyebrowColor: 'text-[#633806]',
    valueColor: 'text-[#854F0B]',
    dot: 'bg-[#EF9F27]',
  },
  expired: {
    bar: 'bg-[#E24B4A]',
    border: 'border-[#F09595]',
    bg: 'bg-[#FEF0F0]',
    icon: <XCircle className="w-[13px] h-[13px]" />,
    iconColor: 'text-[#A32D2D]',
    eyebrow: 'Session expired',
    eyebrowColor: 'text-[#791F1F]',
    valueColor: 'text-[#A32D2D]',
    dot: 'bg-[#E24B4A]',
  },
}

export function TokenSessionTimer() {
  const [session, setSession] = useState(() => getBuilderDemoAuthSession())
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const sync = () => {
      setSession(getBuilderDemoAuthSession())
      setNowMs(Date.now())
    }
    window.addEventListener('builderDemoAuthSessionChanged', sync)
    return () => window.removeEventListener('builderDemoAuthSessionChanged', sync)
  }, [])

  useEffect(() => {
    if (!session?.token) return
    const t = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [session?.token])

  const tokenMeta = session?.token
    ? getBuilderDemoAuthTokenMeta(session.token, nowMs)
    : null

  if (!session?.token || !tokenMeta) return null

  const chipState: ChipState = tokenMeta.isExpired
    ? 'expired'
    : typeof tokenMeta.remainingMs === 'number' && tokenMeta.remainingMs <= 5 * 60 * 1000
      ? 'warning'
      : 'active'

  const cfg = CHIP_CONFIG[chipState]
  const countdown =
    typeof tokenMeta.remainingMs === 'number' && !tokenMeta.isExpired
      ? formatCountdown(tokenMeta.remainingMs)
      : null

  return (
    <>
      {/* Mobile: icon-only square */}
      <Link
        href="/auth-flow"
        className={`md:hidden w-[30px] h-[30px] rounded-md border flex items-center justify-center flex-shrink-0 ${cfg.border} ${cfg.bg} ${cfg.iconColor}`}
        title={tokenMeta.isExpired ? 'Session expired' : 'Token session'}
      >
        {cfg.icon}
      </Link>

      {/* Desktop: full chip — fixed w-[152px] prevents any layout shift */}
      <div
        className={`
          hidden md:flex items-center h-[30px] w-[152px] rounded-md border
          overflow-hidden flex-shrink-0
          ${cfg.border} ${cfg.bg}
        `}
      >
        {/* Left accent bar */}
        <div className={`w-[3px] self-stretch flex-shrink-0 ${cfg.bar}`} />

        {/* Icon */}
        <div className={`w-[26px] flex items-center justify-center flex-shrink-0 ${cfg.iconColor}`}>
          {cfg.icon}
        </div>

        {/* Text */}
        <div className="flex flex-col gap-px flex-1 min-w-0 pr-2">
          <span
            className={`text-[8.5px] font-medium uppercase tracking-[.07em] leading-none opacity-80 ${cfg.eyebrowColor}`}
          >
            {cfg.eyebrow}
          </span>

          <span className={`text-[11.5px] font-medium leading-none flex items-baseline gap-[3px] ${cfg.valueColor}`}>
            {tokenMeta.isExpired ? (
              <button
                type="button"
                className="text-[10.5px] font-medium underline underline-offset-2"
                onClick={() => clearBuilderDemoAuthSession()}
              >
                Re-login
              </button>
            ) : countdown ? (
              <>
                <span className="text-[10px] opacity-75">exp</span>
                <span
                  className="font-mono tabular-nums inline-block min-w-[46px]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {countdown}
                </span>
              </>
            ) : (
              'Active'
            )}
          </span>
        </div>

        {/* Status dot */}
        <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 mr-2 ${cfg.dot}`} />
      </div>
    </>
  )
}
