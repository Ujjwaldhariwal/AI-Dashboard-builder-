'use client'

// src/components/builder/style-panel/widget-style-panel.tsx

import { useDashboardStore } from '@/store/builder-store'
import type { WidgetStyle, LabelFormat } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Paintbrush, RotateCcw, Palette, Eye, Sliders } from 'lucide-react'
import { toast } from 'sonner'

interface WidgetStylePanelProps {
  selectedWidgetId: string | null
}

// ── Fix #4 — typed tooltip field descriptor ───────────────────
type TooltipKey = 'tooltipBg' | 'tooltipBorder'
interface TooltipField {
  key:      TooltipKey
  label:    string
  fallback: string
}
const TOOLTIP_FIELDS: TooltipField[] = [
  { key: 'tooltipBg',     label: 'Background', fallback: '#ffffff' },
  { key: 'tooltipBorder', label: 'Border',     fallback: '#e2e8f0' },
]

type LabelFormatOption = LabelFormat | 'number'
const FORMAT_OPTIONS: { value: LabelFormatOption; label: string }[] = [
  { value: 'number',   label: 'Number  (1,234)'  },
  { value: 'currency', label: 'Currency  ($1.2k)' },
  { value: 'percent',  label: 'Percent  (42.0%)'  },
]

export function WidgetStylePanel({ selectedWidgetId }: WidgetStylePanelProps) {
  const { widgets, updateWidgetStyle,resetWidgetStyle  } = useDashboardStore()

  // ── Fix #3 — resetWidgetStyle may not exist in store ─────────
  // Use updateWidgetStyle with DEFAULT_STYLE as the safe fallback.
  // If your store has resetWidgetStyle, swap this line:
  //   const { widgets, updateWidgetStyle, resetWidgetStyle } = useDashboardStore()
 

  const widget = widgets.find(w => w.id === selectedWidgetId)

  if (!widget) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 flex items-center justify-center">
          <Paintbrush className="w-6 h-6 text-purple-500" />
        </div>
        <p className="text-sm font-semibold">No widget selected</p>
        <p className="text-xs text-muted-foreground max-w-[200px] leading-relaxed">
          Click any widget on the canvas to style it visually
        </p>
      </div>
    )
  }

  const style   = { ...DEFAULT_STYLE, ...widget.style }
  const isBar   = ['bar', 'horizontal-bar'].includes(widget.type)
  const hasGrid = !['pie', 'donut', 'gauge', 'status-card'].includes(widget.type)

  const updateColor = (idx: number, hex: string) => {
    const next    = [...(style.colors ?? DEFAULT_STYLE.colors)]
    next[idx]     = hex
    updateWidgetStyle(widget.id, { colors: next })
  }

  const handleReset = () => {
    resetWidgetStyle(widget.id)
    toast.success(`"${widget.title}" reset to default style`)
  }

  // ── Fix #10 — resolve stored format to typed value ────────────
  const currentFormat: LabelFormatOption =
    (FORMAT_OPTIONS.find(f => f.value === style.labelFormat)?.value) ?? 'number'

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <div className="px-4 py-3 border-b bg-purple-500/5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{widget.title}</p>
            <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
              {widget.type} · {widget.dataMapping.xAxis} → {widget.dataMapping.yAxis}
            </p>
          </div>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
            onClick={handleReset} title="Reset to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6 flex-1">

        {/* Colors */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="w-3.5 h-3.5 text-muted-foreground" />
            <Label className="text-xs font-semibold">Chart Colors</Label>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {(style.colors ?? DEFAULT_STYLE.colors).slice(0, 6).map((color, i) => (
              <label key={i} className="relative cursor-pointer group" title={color}>
                <div
                  className="w-9 h-9 rounded-lg shadow-sm ring-2 ring-transparent group-hover:ring-white/30 transition-all"
                  style={{ backgroundColor: color }}
                />
                <input
                  type="color"
                  value={color}
                  onChange={e => updateColor(i, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-lg"
                />
              </label>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Click any swatch to pick a color</p>
        </section>

        {/* Display toggles */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <Label className="text-xs font-semibold">Display</Label>
          </div>
          <div className="rounded-lg border divide-y">
            {hasGrid && (
              <div className="flex items-center justify-between px-3 py-2.5">
                <Label className="text-xs cursor-pointer">Grid lines</Label>
                <Switch
                  checked={style.showGrid ?? true}
                  onCheckedChange={v => updateWidgetStyle(widget.id, { showGrid: v })}
                />
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-2.5">
              <Label className="text-xs cursor-pointer">Legend</Label>
              <Switch
                checked={style.showLegend ?? true}
                onCheckedChange={v => updateWidgetStyle(widget.id, { showLegend: v })}
              />
            </div>
          </div>
        </section>

        {/* Bar radius */}
        {isBar && (
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
              <Label className="text-xs font-semibold">Bar Radius</Label>
              <span className="ml-auto text-xs font-mono text-muted-foreground">
                {style.barRadius ?? 5}px
              </span>
            </div>
            <input
              type="range" min={0} max={20}
              value={style.barRadius ?? 5}
              onChange={e => updateWidgetStyle(widget.id, { barRadius: Number(e.target.value) })}
              className="w-full h-1.5 rounded-full cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Sharp</span><span>Rounded</span>
            </div>
          </section>
        )}

        {/* Value format */}
        <section className="space-y-2">
          <Label className="text-xs font-semibold">Value Format</Label>
          {/* ── Fix #10 — typed Select with validated options ── */}
          <Select
            value={currentFormat}
            onValueChange={v => updateWidgetStyle(widget.id, {
              labelFormat: v === 'number' ? undefined : v as LabelFormat,
            })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* Tooltip colors */}
        <section className="space-y-2.5">
          <Label className="text-xs font-semibold">Tooltip</Label>
          <div className="grid grid-cols-2 gap-3">
            {/* ── Fix #4 — fully typed, no 'as any' ─────────── */}
            {TOOLTIP_FIELDS.map(({ key, label, fallback }) => (
              <div key={key} className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <label className="relative flex items-center gap-2 cursor-pointer group">
                  <div
                    className="w-7 h-7 rounded-md border-2 border-border group-hover:border-primary/50 transition-colors flex-shrink-0"
                    style={{ backgroundColor: (style as WidgetStyle)[key] ?? fallback }}
                  />
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {(style as WidgetStyle)[key] ?? 'auto'}
                  </span>
                  <input
                    type="color"
                    value={(style as WidgetStyle)[key] ?? fallback}
                    onChange={e => updateWidgetStyle(widget.id, { [key]: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
