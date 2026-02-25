// src/components/builder/canvas/sortable-widget-card.tsx
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { WidgetCard } from './widget-card'
import { Widget } from '@/types/widget'
import { GripVertical } from 'lucide-react'

interface SortableWidgetCardProps {
  widget: Widget
}

export function SortableWidgetCard({ widget }: SortableWidgetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group/sortable h-full">
      {/* ── Drag Handle (visible on hover) ── */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 p-1.5 bg-background border shadow-sm rounded-md opacity-0 group-hover/sortable:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:bg-muted"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      <WidgetCard widget={widget} />
    </div>
  )
}
