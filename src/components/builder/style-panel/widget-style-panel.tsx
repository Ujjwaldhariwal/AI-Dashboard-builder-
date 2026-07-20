'use client'

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

// src/components/builder/style-panel/widget-style-panel.tsx

import { useState } from 'react'
import { useDashboardStore } from '@/store/builder-store'
import type { WidgetStyle, LabelFormat } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { BOSCH_COLORS, ENTERPRISE_COLORS } from '@/lib/echarts/theme'
import { askUiDesigner } from '@/lib/ai/agent-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Paintbrush, RotateCcw, Palette, Eye, Sliders, Sparkles, Loader2 } from 'lucide-react'
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

type PaletteOption = 'enterprise' | 'bosch-uppcl' | 'custom'
const PALETTE_OPTIONS: { value: Exclude<PaletteOption, 'custom'>; label: string }[] = [
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'bosch-uppcl', label: 'Bosch UPPCL' },
]

const colorsMatch = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, idx) => value.toLowerCase() === right[idx].toLowerCase())

export function WidgetStylePanel({ selectedWidgetId }: WidgetStylePanelProps) {
  const { widgets, updateWidgetStyle,resetWidgetStyle  } = useDashboardStore()
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiApplying, setAiApplying] = useState(false)

  // ── Fix #3 — resetWidgetStyle may not exist in store ─────────
  // Use updateWidgetStyle with DEFAULT_STYLE as the safe fallback.
  // If your store has resetWidgetStyle, swap this line:
  //   const { widgets, updateWidgetStyle, resetWidgetStyle } = useDashboardStore()
 

  const widget = widgets.find(w => w.id === selectedWidgetId)

  if (!widget) {
    return (
      <div className="flex h-full flex-col justify-between gap-10 p-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
          <Paintbrush className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Select a widget to style</p>
          <p className="mt-2 max-w-[17rem] text-xs leading-5 text-muted-foreground">
            Choose a canvas item to edit its palette, labels, tooltip, legend, and chart-specific controls.
          </p>
        </div>
      </div>
    )
  }

  const style   = { ...DEFAULT_STYLE, ...widget.style }
  const isBar   = ['bar', 'horizontal-bar'].includes(widget.type)
  const hasGrid = !['pie', 'donut', 'gauge', 'status-card'].includes(widget.type)
  const resolvedColors = style.colors ?? DEFAULT_STYLE.colors
  const paletteValue: PaletteOption = colorsMatch(resolvedColors, BOSCH_COLORS)
    ? 'bosch-uppcl'
    : (colorsMatch(resolvedColors, ENTERPRISE_COLORS) ? 'enterprise' : 'custom')

  const updateColor = (idx: number, hex: string) => {
    const next    = [...resolvedColors]
    next[idx]     = hex
    updateWidgetStyle(widget.id, { colors: next })
  }

  const applyPalette = (palette: Exclude<PaletteOption, 'custom'>) => {
    const nextColors = palette === 'bosch-uppcl' ? BOSCH_COLORS : ENTERPRISE_COLORS
    updateWidgetStyle(widget.id, { colors: [...nextColors] })
    toast.success(`Applied ${palette === 'bosch-uppcl' ? 'Bosch UPPCL' : 'Enterprise'} palette`)
  }

  const handleReset = () => {
    resetWidgetStyle(widget.id)
    toast.success(`"${widget.title}" reset to default style`)
  }

  const handleApplyAiStyle = async () => {
    const prompt = aiPrompt.trim()
    if (!prompt) {
      toast.error('Describe the style you want first')
      return
    }

    setAiApplying(true)
    try {
      const nextStyle = await askUiDesigner(prompt, style)
      updateWidgetStyle(widget.id, nextStyle)
      toast.success(`AI style applied to "${widget.title}"`)
      setAiPrompt('')
    } catch {
      // Error toast handled in askUiDesigner.
    } finally {
      setAiApplying(false)
    }
  }

  // ── Fix #10 — resolve stored format to typed value ────────────
  const currentFormat: LabelFormatOption =
    (FORMAT_OPTIONS.find(f => f.value === style.labelFormat)?.value) ?? 'number'

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <div className="flex-shrink-0 border-b bg-muted/25 px-4 py-3">
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
          <Select
            value={paletteValue}
            onValueChange={(value) => {
              if (value === 'custom') return
              applyPalette(value as Exclude<PaletteOption, 'custom'>)
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PALETTE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              {paletteValue === 'custom' && (
                <SelectItem value="custom">Custom</SelectItem>
              )}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-6 gap-2">
            {resolvedColors.slice(0, 6).map((color, i) => (
              <label key={i} className="relative cursor-pointer group" title={color}>
                <div
                  className="h-9 w-9 rounded-md border ring-2 ring-transparent transition-colors group-hover:ring-foreground/20"
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
              className="h-1.5 w-full cursor-pointer rounded-full accent-primary"
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

        {/* AI style assistant */}
        <section className="space-y-2.5 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            <Label className="text-xs font-semibold">AI Style Assistant</Label>
          </div>
          <Input
            className="h-8 text-xs"
            placeholder='e.g., "Use enterprise dark tooltip and muted teal palette"'
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            disabled={aiApplying}
          />
          <Button
            size="sm"
            className="h-8 w-full text-xs"
            onClick={() => void handleApplyAiStyle()}
            disabled={aiApplying}
          >
            {aiApplying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Apply AI Style
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            AI output is validated against strict WidgetStyle schema.
          </p>
        </section>

      </div>
    </div>
  )
}
