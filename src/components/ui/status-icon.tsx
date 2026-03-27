"use client"

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

export type StatusLevel = "healthy" | "degraded" | "down" | "unknown"
export type TrendDirection = "improving" | "stable" | "worsening"
type SizeVariant = "sm" | "md" | "lg"

// ─── Size map ────────────────────────────────────────────────────────────────

const SIZE: Record<SizeVariant, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
}

// ─── StatusIcon ──────────────────────────────────────────────────────────────

interface StatusIconProps {
  status: StatusLevel
  size?: SizeVariant
  /** Required for icon-only usage — screen readers need this */
  "aria-label": string
  className?: string
}

const STATUS_CONFIG: Record<
  StatusLevel,
  { Icon: React.ElementType; className: string }
> = {
  healthy:  { Icon: CheckCircle2,   className: "text-emerald-500 dark:text-emerald-400" },
  degraded: { Icon: AlertTriangle,  className: "text-amber-500   dark:text-amber-400"   },
  down:     { Icon: XCircle,        className: "text-red-500     dark:text-red-400"      },
  unknown:  { Icon: HelpCircle,     className: "text-muted-foreground"                   },
}

export function StatusIcon({
  status,
  size = "md",
  "aria-label": ariaLabel,
  className,
}: StatusIconProps) {
  const { Icon, className: colorClass } = STATUS_CONFIG[status]
  return (
    <Icon
      className={cn(SIZE[size], colorClass, "shrink-0", className)}
      aria-label={ariaLabel}
      role="img"
    />
  )
}

// ─── TrendIcon ───────────────────────────────────────────────────────────────

interface TrendIconProps {
  trend: TrendDirection
  size?: SizeVariant
  "aria-label": string
  className?: string
}

const TREND_CONFIG: Record<
  TrendDirection,
  { Icon: React.ElementType; className: string }
> = {
  improving: { Icon: TrendingDown, className: "text-emerald-500 dark:text-emerald-400" },
  stable:    { Icon: Minus,        className: "text-muted-foreground"                   },
  worsening: { Icon: TrendingUp,   className: "text-red-500     dark:text-red-400"      },
}

export function TrendIcon({
  trend,
  size = "md",
  "aria-label": ariaLabel,
  className,
}: TrendIconProps) {
  const { Icon, className: colorClass } = TREND_CONFIG[trend]
  return (
    <Icon
      className={cn(SIZE[size], colorClass, "shrink-0", className)}
      aria-label={ariaLabel}
      role="img"
    />
  )
}

// ─── LatencyBadge ────────────────────────────────────────────────────────────

interface LatencyBadgeProps {
  latencyMs: number | undefined | null
  className?: string
}

export function LatencyBadge({ latencyMs, className }: LatencyBadgeProps) {
  if (latencyMs == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
          "bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        — ms
      </span>
    )
  }

  const colorClass =
    latencyMs < 200
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : latencyMs < 500
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-red-500/10 text-red-600 dark:text-red-400"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        colorClass,
        className,
      )}
    >
      {latencyMs} ms
    </span>
  )
}

// ─── ErrorBadge ──────────────────────────────────────────────────────────────

interface ErrorBadgeProps {
  count: number
  className?: string
}

export function ErrorBadge({ count, className }: ErrorBadgeProps) {
  const colorClass =
    count === 0
      ? "bg-muted/40 text-muted-foreground"
      : count <= 5
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-red-500/10 text-red-600 dark:text-red-400"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        colorClass,
        className,
      )}
    >
      {count} {count === 1 ? "error" : "errors"}
    </span>
  )
}
