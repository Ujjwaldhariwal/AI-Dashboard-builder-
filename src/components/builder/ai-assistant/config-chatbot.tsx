'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Palette, Plus, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { toast } from 'sonner'
import { ChartType, WidgetStyle } from '@/types/widget'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import {
  describeBuilderWidgetPatch,
  validateBuilderWidgetPatch,
  type BuilderWidgetPatch,
} from '@/lib/ai/builder-assistant-contract'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'

interface WidgetAction {
  action: 'create_widget'
  title: string
  type: ChartType
  xAxis: string
  yAxis: string
  description: string
}

interface StyleAction {
  action: 'update_style'
  widgetId: string
  style: Partial<WidgetStyle>
  description: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  widgetAction?: WidgetAction | null
  styleAction?: StyleAction | null
  widgetPatchAction?: (BuilderWidgetPatch & { widgetId: string }) | null
}

interface ConfigChatbotProps {
  selectedWidgetId?: string | null
}

const BASE_PROMPTS = [
  'Build a chart from my first API endpoint',
  'Suggest the best chart type for my data',
  'Create a weekly trend chart',
]

const EDIT_PROMPTS = [
  'Change this to a horizontal bar chart',
  'Use the best available category and value fields',
  'Rename this chart and improve its readability',
]

const INITIAL_MESSAGE =
  "I can help you build and style dashboard charts.\n\n" +
  "For chart creation: ask what to build from your API data.\n" +
  "Select a widget to change its chart type, field mapping, title, or visual style with a reviewed patch."

function cleanAssistantMessage(content: string): string {
  return content
    .replace(/```widget_patch[\s\S]*?```/g, '')
    .replace(/```widget[\s\S]*?```/g, '')
    .replace(/```style[\s\S]*?```/g, '')
    .trim()
}

export function ConfigChatbot({ selectedWidgetId }: ConfigChatbotProps) {
  const { endpoints, widgets, currentDashboardId, addWidget, updateWidget, updateWidgetStyle } =
    useDashboardStore()
  const builderScope = useScopedBuilderStore(state => state.scope)

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: INITIAL_MESSAGE },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const buildContext = async () => {
    const dashboardWidgets = widgets.filter(
      (w) => w.dashboardId === currentDashboardId,
    )

    const context: any = {
      dashboardId: currentDashboardId,
      tenantId: builderScope?.tenantId,
      projectId: builderScope?.projectId,
      connectedEndpoints: endpoints.map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
      })),
      existingWidgetCount: dashboardWidgets.length,
      fields: [],
      selectedWidget: selectedWidget
        ? {
            id: selectedWidget.id,
            title: selectedWidget.title,
            type: selectedWidget.type,
            currentStyle: selectedWidget.style,
            xAxis: selectedWidget.dataMapping.xAxis,
            yAxis: selectedWidget.dataMapping.yAxis,
          }
        : null,
      editMode: !!selectedWidget,
      styleOnlyMode: false,
    }

    const endpointForContext = selectedWidget
      ? endpoints.find((e) => e.id === selectedWidget.endpointId) ?? endpoints[0]
      : endpoints[0]

    if (endpointForContext) {
      try {
        const response = await fetch(endpointForContext.url, {
          ...buildEndpointRequestInit({
            method: endpointForContext.method,
            headers: endpointForContext.headers,
            body: endpointForContext.body,
          }),
        })
        if (response.ok) {
          const raw = await response.json()
          const rows = DataAnalyzer.extractDataArray(raw) ?? []
          context.fields = DataAnalyzer.inferTypes(rows)
          context.sampleRows = rows.slice(0, 3)
          context.totalRows = rows.length
          context.activeEndpointName = endpointForContext.name
        }
      } catch {
        // keep context minimal when endpoint probe fails
      }
    }

    return context
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return

    const userMessage: Message = { role: 'user', content: text.trim() }
    const history = [...messages, userMessage]

    setMessages(history)
    setInput('')
    setLoading(true)

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000)

    try {
      const context = await buildContext()
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context,
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.message,
          widgetAction: data.widgetAction ?? null,
          styleAction: data.styleAction ?? null,
          widgetPatchAction: data.widgetPatchAction ?? null,
        },
      ])
    } catch (error: unknown) {
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Request timed out after 30 seconds.'
          : error instanceof Error
            ? error.message
            : 'Unknown error'

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I hit an error: ${message} Please try again.`,
        },
      ])
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  const handleCreateWidget = (action: WidgetAction) => {
    if (!currentDashboardId) {
      toast.error('No dashboard selected')
      return
    }
    if (!endpoints.length) {
      toast.error('Connect an API first in API Config')
      return
    }

    const endpoint = endpoints[0]
    addWidget({
      title: action.title,
      type: action.type,
      endpointId: endpoint.id,
      dataMapping: {
        xAxis: action.xAxis,
        yAxis: action.yAxis,
      },
    })

    toast.success(`Widget "${action.title}" added`)
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Added "${action.title}" to this dashboard.`,
      },
    ])
  }

  const handleApplyStyle = (action: StyleAction) => {
    const target = widgets.find((widget) => widget.id === action.widgetId)
    if (!target) {
      toast.error('Widget not found')
      return
    }

    const safeStyle: Partial<WidgetStyle> = {}
    const allowed: (keyof WidgetStyle)[] = [
      'colors',
      'tooltipBg',
      'tooltipBorder',
      'labelFormat',
      'barRadius',
      'showLegend',
      'showGrid',
    ]

    allowed.forEach((key) => {
      if (key in action.style) {
        ;(safeStyle as any)[key] = (action.style as any)[key]
      }
    })

    updateWidgetStyle(action.widgetId, safeStyle)
    toast.success(`Style updated for "${target.title}"`)
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Applied style changes to "${target.title}".`,
      },
    ])
  }

  const handleApplyWidgetPatch = async (action: BuilderWidgetPatch & { widgetId: string }) => {
    const target = widgets.find(widget => widget.id === action.widgetId)
    if (!target || target.id !== selectedWidget?.id) {
      toast.error('Select the target chart again before applying this change.')
      return
    }
    const context = await buildContext()
    const allowedFields = Array.isArray(context.fields)
      ? context.fields.flatMap((field: unknown) => {
          if (!field || typeof field !== 'object' || Array.isArray(field)) return []
          const name = (field as Record<string, unknown>).name
          return typeof name === 'string' ? [name] : []
        })
      : []
    const validation = validateBuilderWidgetPatch({ widget: target, patch: action, allowedFields })
    if (!validation.ok || !validation.updates) {
      toast.error(validation.issues[0] ?? 'The proposed chart change is not valid.')
      return
    }
    updateWidget(target.id, validation.updates)
    toast.success(`Updated "${target.title}"`)
    setMessages(current => [...current, {
      role: 'assistant',
      content: 'Applied the validated chart change. You can continue editing it manually or ask for another revision.',
    }])
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    sendMessage(input)
  }

  const quickPrompts = selectedWidget ? EDIT_PROMPTS : BASE_PROMPTS

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <p className="text-[11px] text-muted-foreground">
              {selectedWidget
                ? 'Edit mode for selected chart'
                : 'Chart creation mode'}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {endpoints.length} API{endpoints.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {selectedWidget
            ? `Target: ${selectedWidget.title}`
            : 'Select a chart on canvas to edit its data, type, or appearance.'}
        </p>
      </div>

      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex flex-col gap-2 ${
              message.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[92%] rounded-lg border px-3 py-2 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'border-primary/20 bg-primary text-primary-foreground'
                  : 'border-border bg-muted/40'
              }`}
            >
              <p className="whitespace-pre-wrap">
                {cleanAssistantMessage(message.content)}
              </p>
            </div>

            {message.widgetAction?.action === 'create_widget' && (
              <div className="w-full max-w-[92%] rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {message.widgetAction.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {message.widgetAction.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {message.widgetAction.type}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    X: {message.widgetAction.xAxis}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    Y: {message.widgetAction.yAxis}
                  </span>
                </div>
                <Button
                  size="sm"
                  className="mt-3 h-8 w-full text-xs"
                  onClick={() => handleCreateWidget(message.widgetAction!)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Widget
                </Button>
              </div>
            )}

            {message.styleAction?.action === 'update_style' && (
              <div className="w-full max-w-[92%] rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5 text-blue-600" />
                  <div>
                    <p className="text-xs font-semibold">Style update</p>
                    <p className="text-[10px] text-muted-foreground">
                      {message.styleAction.description}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                  {message.styleAction.style.showGrid !== undefined && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      Grid: {message.styleAction.style.showGrid ? 'on' : 'off'}
                    </span>
                  )}
                  {message.styleAction.style.showLegend !== undefined && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      Legend:{' '}
                      {message.styleAction.style.showLegend ? 'on' : 'off'}
                    </span>
                  )}
                  {message.styleAction.style.barRadius !== undefined && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      Radius: {message.styleAction.style.barRadius}px
                    </span>
                  )}
                  {message.styleAction.style.colors?.length ? (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      Colors: {message.styleAction.style.colors.length}
                    </span>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8 w-full text-xs"
                  onClick={() => handleApplyStyle(message.styleAction!)}
                >
                  Apply Style
                </Button>
              </div>
            )}

            {message.widgetPatchAction?.action === 'update_widget' && selectedWidget?.id === message.widgetPatchAction.widgetId && (
              <div className="w-full max-w-[92%] rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <div>
                    <p className="text-xs font-semibold">Reviewed chart change</p>
                    <p className="text-[10px] text-muted-foreground">{message.widgetPatchAction.description}</p>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                  {describeBuilderWidgetPatch(selectedWidget, message.widgetPatchAction).map(change => (
                    <p key={change} className="rounded bg-muted px-2 py-1 font-mono">{change}</p>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="mt-3 h-8 w-full text-xs"
                  onClick={() => void handleApplyWidgetPatch(message.widgetPatchAction!)}
                >
                  Apply validated change
                </Button>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            AI is preparing a response...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && !loading && (
        <div className="border-t bg-background px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t px-3 py-3">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            selectedWidget
              ? `Change "${selectedWidget.title}"...`
              : 'Ask to create or improve a chart...'
          }
          disabled={loading}
          className="h-9 flex-1 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={loading || !input.trim()}
          className="h-9 px-3"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  )
}
