'use client'

// Module: Config Chatbot — AI scoped to style layer (Layer 3) only
// src/components/builder/ai-assistant/config-chatbot.tsx

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Send, Loader2, X, Bot,
  User, Plus, Palette, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { toast } from 'sonner'
import { ChartType, WidgetStyle } from '@/types/widget'

// ── Types ─────────────────────────────────────────────────────
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
}

interface ConfigChatbotProps {
  onClose?: () => void
  selectedWidgetId?: string | null  // Phase 2 — scopes AI to this widget's style
}

const QUICK_PROMPTS = [
  'What charts work best with my data?',
  'Create a bar chart for me',
  'Change the colors of this chart',
  'Hide the legend on this chart',
]

export function ConfigChatbot({ onClose, selectedWidgetId }: ConfigChatbotProps) {
  const {
    endpoints, widgets, currentDashboardId,
    addWidget, updateWidgetStyle,
  } = useDashboardStore()

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your AI chart assistant.\n\n" +
        "**To create charts:** Ask me to build a chart from your API data.\n" +
        "**To style a chart:** Select a widget on the canvas, then ask me to change colors, labels, tooltips, grid, or legend.",
    },
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef             = useRef<HTMLDivElement>(null)

  const selectedWidget = widgets.find(w => w.id === selectedWidgetId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Build context — includes selected widget style if present ──
  const buildContext = async () => {
    const dashboardWidgets = widgets.filter(w => w.dashboardId === currentDashboardId)

    const context: any = {
      dashboardId: currentDashboardId,
      connectedEndpoints: endpoints.map(e => ({ id: e.id, name: e.name, url: e.url })),
      existingWidgetCount: dashboardWidgets.length,
      fields: [],
      // Phase 2 — selected widget style context
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
      // Instruction: AI must never touch base or deps layers
      styleOnlyMode: !!selectedWidget,
    }

    const first = endpoints[0]
    if (first) {
      try {
        const res = await fetch(first.url, { method: first.method })
        if (res.ok) {
          const raw  = await res.json()
          const arr  = DataAnalyzer.extractDataArray(raw) ?? []
          context.fields           = DataAnalyzer.inferTypes(arr)
          context.sampleRows       = arr.slice(0, 3)
          context.totalRows        = arr.length
          context.activeEndpointName = first.name
        }
      } catch {}
    }

    return context
  }

  // ── Send message ───────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const context = await buildContext()

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.role,
            content: m.content,
          })),
          context,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.message,
          widgetAction: data.widgetAction ?? null,
          styleAction:  data.styleAction  ?? null,
        },
      ])
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I hit an error: ${err.message}. Make sure your OpenAI API key is set in .env.local.`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  // ── Create widget from AI action ───────────────────────────────
  const handleCreateWidget = (action: WidgetAction) => {
    if (!currentDashboardId) { toast.error('No dashboard selected'); return }
    if (!endpoints.length)   { toast.error('Connect an API first in API Config'); return }

    const endpoint = endpoints[0]
    addWidget({
      title: action.title,
      type:  action.type,
      endpointId: endpoint.id,
      xAxis: action.xAxis,
      yAxis: action.yAxis,
    })

    toast.success(`Widget "${action.title}" added!`)
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `✅ Created **${action.title}** (${action.type} chart) using data from *${endpoint.name}*.`,
      },
    ])
  }

  // ── Apply style update — Layer 3 ONLY ─────────────────────────
  const handleApplyStyle = (action: StyleAction) => {
    const target = widgets.find(w => w.id === action.widgetId)
    if (!target) { toast.error('Widget not found'); return }

    // Guard — never allow base/deps fields to sneak in
    const safeStyle: Partial<WidgetStyle> = {}
    const allowed: (keyof WidgetStyle)[] = [
      'colors', 'tooltipBg', 'tooltipBorder',
      'labelFormat', 'customCSS', 'barRadius',
      'showLegend', 'showGrid',
    ]
    allowed.forEach(key => {
      if (key in action.style) (safeStyle as any)[key] = (action.style as any)[key]
    })

    updateWidgetStyle(action.widgetId, safeStyle)
    toast.success(`Style updated for "${target.title}"`)

    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `✅ Style applied to **${target.title}**: ${action.description}`,
      },
    ])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-600/10 to-purple-600/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Chart Assistant</p>
            <p className="text-[10px] text-muted-foreground">
              {endpoints.length} API{endpoints.length !== 1 ? 's' : ''} connected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedWidget && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Palette className="w-2.5 h-2.5" />
              {selectedWidget.title}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">Gemeni</Badge>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Selected widget context bar */}
      {selectedWidget && (
        <div className="px-4 py-2 bg-purple-500/5 border-b flex items-center gap-2">
          <Palette className="w-3 h-3 text-purple-500 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            Styling: <span className="font-semibold text-foreground">{selectedWidget.title}</span>
            <span className="ml-1 text-purple-500">— AI will only edit colors, labels & tooltips</span>
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                  msg.role === 'assistant'
                    ? 'bg-gradient-to-br from-blue-600 to-purple-600'
                    : 'bg-muted border'
                }`}
              >
                {msg.role === 'assistant'
                  ? <Bot className="w-3.5 h-3.5 text-white" />
                  : <User className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </div>

              <div className={`max-w-[82%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Bubble */}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">
                    {msg.content.replace(/```widget[\s\S]*?```/g, '').trim()}
                  </p>
                </div>

                {/* Create widget action card */}
                {msg.widgetAction?.action === 'create_widget' && (
                  <div className="bg-card border rounded-xl p-3 w-full space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">{msg.widgetAction.title}</p>
                        <p className="text-[10px] text-muted-foreground">{msg.widgetAction.description}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        {msg.widgetAction.type}
                      </Badge>
                    </div>
                    <div className="flex gap-1.5 text-[10px] text-muted-foreground">
                      <span className="bg-muted px-1.5 py-0.5 rounded font-mono">X: {msg.widgetAction.xAxis}</span>
                      <span className="bg-muted px-1.5 py-0.5 rounded font-mono">Y: {msg.widgetAction.yAxis}</span>
                    </div>
                    <Button
                      size="sm" className="w-full h-7 text-xs"
                      onClick={() => handleCreateWidget(msg.widgetAction!)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add to Dashboard
                    </Button>
                  </div>
                )}

                {/* Style update action card — Layer 3 only */}
                {msg.styleAction?.action === 'update_style' && (
                  <div className="bg-card border border-purple-200 dark:border-purple-900 rounded-xl p-3 w-full space-y-2">
                    <div className="flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">Style Update</p>
                        <p className="text-[10px] text-muted-foreground">{msg.styleAction.description}</p>
                      </div>
                    </div>
                    {/* Preview color swatches if colors changed */}
                    {msg.styleAction.style.colors && (
                      <div className="flex gap-1 flex-wrap">
                        {msg.styleAction.style.colors.map((c, i) => (
                          <span
                            key={i}
                            className="w-4 h-4 rounded-full border border-white shadow-sm"
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    )}
                    {/* Preview other changes */}
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {msg.styleAction.style.showGrid !== undefined && (
                        <span className="bg-muted px-1.5 py-0.5 rounded">
                          Grid: {msg.styleAction.style.showGrid ? 'on' : 'off'}
                        </span>
                      )}
                      {msg.styleAction.style.showLegend !== undefined && (
                        <span className="bg-muted px-1.5 py-0.5 rounded">
                          Legend: {msg.styleAction.style.showLegend ? 'on' : 'off'}
                        </span>
                      )}
                      {msg.styleAction.style.barRadius !== undefined && (
                        <span className="bg-muted px-1.5 py-0.5 rounded">
                          Radius: {msg.styleAction.style.barRadius}px
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => handleApplyStyle(msg.styleAction!)}
                    >
                      <ChevronRight className="w-3 h-3 mr-1" />
                      Apply Style
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2.5"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {messages.length === 1 && !loading && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              className="text-[11px] px-2.5 py-1 rounded-full border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={
            selectedWidget
              ? `Style "${selectedWidget.title}"...`
              : 'Ask me to create or style charts...'
          }
          disabled={loading}
          className="flex-1 h-9 text-sm"
        />
        <Button
          type="submit" size="sm"
          disabled={loading || !input.trim()}
          className="h-9 px-3"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </Button>
      </form>
    </div>
  )
}
