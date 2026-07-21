'use client'

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · designed-as-app */

import { Bot, Database, Eye, GripVertical, ListChecks, MousePointer2, Plus, Rocket, SlidersHorizontal } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface BuilderGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  widgetCount: number
  endpointCount: number
}

const GUIDE_STEPS = [
  {
    icon: Database,
    label: 'Connect data',
    detail: 'Add and test a read-only endpoint. Scan it before generating charts.',
  },
  {
    icon: ListChecks,
    label: 'Define the brief',
    detail: 'Specify the required chart count, titles, and pinned or flexible chart types.',
  },
  {
    icon: SlidersHorizontal,
    label: 'Refine',
    detail: 'Select any chart to edit it manually or ask the assistant for a validated change.',
  },
  {
    icon: Eye,
    label: 'Preview',
    detail: 'Check the complete dashboard at its target size before export or publishing.',
  },
] as const

export function BuilderGuideDialog({
  open,
  onOpenChange,
  widgetCount,
  endpointCount,
}: BuilderGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Builder guide</DialogTitle>
          <DialogDescription>
            The canvas stays focused on creation. Workflow help and interaction guidance live here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2 sm:grid-cols-2">
          {GUIDE_STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <section key={step.label} className="rounded-lg border bg-muted/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-background">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold">{step.label}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
              </section>
            )
          })}
        </div>

        <section className="rounded-lg border bg-muted/15 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Canvas controls</h3>
            <div className="flex gap-2">
              <Badge variant="outline">{endpointCount} sources</Badge>
              <Badge variant="outline">{widgetCount} widgets</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
            <p className="flex items-center gap-2"><MousePointer2 className="h-3.5 w-3.5" />Select a chart to open contextual editing.</p>
            <p className="flex items-center gap-2"><GripVertical className="h-3.5 w-3.5" />Drag chart cards to reorder the canvas.</p>
            <p className="flex items-center gap-2"><Plus className="h-3.5 w-3.5" />Add a chart manually when exact control is needed.</p>
            <p className="flex items-center gap-2"><Bot className="h-3.5 w-3.5" />Use natural language for reviewed chart changes.</p>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Rocket className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-xs leading-5 text-muted-foreground">
            Autopilot output is never locked. Every generated chart uses the same editor, assistant, drag controls, and preview path as a manually created chart.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
