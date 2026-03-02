// Component: ConfigChatbot
'use client'

// src/components/builder/ai-assistant/config-chatbot.tsx

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Send, Loader2, X, Bot,
  User, Plus, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { toast } from 'sonner'
import { ChartType } from '@/types/widget'

interface Message {
  role: 'user' | 'assistant'
  content: string
  widgetAction?: {
    action: string
    title: string
    type: ChartType
    xAxis: string
    yAxis: string
    description: string
  } | null
}

interface ConfigChatbotProps {
  onClose?: () => void
}

const QUICK_PROMPTS = [
  'What charts work best with my data?',
  'Create a bar chart for me',
  'Add a pie chart showing distribution',
  'Suggest 3 widgets for this API',
]

export function ConfigChatbot({ onClose }: ConfigChatbotProps) {
  const { endpoints, widgets, currentDashboardId, addWidget } = useDashboardStore()

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your AI chart assistant. I can analyze your connected APIs and create widgets for you.\n\nTry: *\"Create a bar chart\"* or *\"What charts suit my data?\"*",
    },
  ])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const bottomRef                 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Build context from connected endpoints ─────────────────────────────
  const buildContext = async () => {
    const context: any = {
      dashboardId: currentDashboardId,
      connectedEndpoints: endpoints.map(e => ({ id: e.id, name: e.name, url: e.url })),
      existingWidgetCount: widgets.filter(w => w.dashboardId === currentDashboardId).length,
      fields: [],
    }

    // Try to fetch fields from first endpoint
    const first = endpoints[0]
    if (first) {
      try {
        const res = await fetch(first.url, { method: first.method })
        if (res.ok) {
          const raw = await res.json()
          const arr = DataAnalyzer.extractDataArray(raw) ?? []
          context.fields = DataAnalyzer.inferTypes(arr)
          context.sampleRows = arr.slice(0, 3)
          context.totalRows = arr.length
          context.activeEndpointName = first.name
        }
      } catch {}
    }

    return context
  }

  // ── Send message ───────────────────────────────────────────────────────
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
          widgetAction: data.widgetAction,
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

  // ── Create widget from AI action ───────────────────────────────────────
  const handleCreateWidget = (action: NonNullable<Message['widgetAction']>) => {
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
      xAxis: action.xAxis,
      yAxis: action.yAxis,
    })

    toast.success(`Widget "${action.title}" added!`)

    // Confirm in chat
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `✅ Created **${action.title}** (${action.type} chart) using data from *${endpoint.name}*.`,
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
          <Badge variant="secondary" className="text-[10px]">GPT-4o mini</Badge>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

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
                  {/* Strip ```widget code block from display */}
                  <p className="whitespace-pre-wrap">
                    {msg.content.replace(/```widget[\s\S]*?```/g, '').trim()}
                  </p>
                </div>

                {/* Widget action card */}
                {msg.widgetAction?.action === 'create_widget' && (
                  <div className="bg-card border rounded-xl p-3 w-full space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">{msg.widgetAction.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {msg.widgetAction.description}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        {msg.widgetAction.type}
                      </Badge>
                    </div>
                    <div className="flex gap-1.5 text-[10px] text-muted-foreground">
                      <span className="bg-muted px-1.5 py-0.5 rounded font-mono">
                        X: {msg.widgetAction.xAxis}
                      </span>
                      <span className="bg-muted px-1.5 py-0.5 rounded font-mono">
                        Y: {msg.widgetAction.yAxis}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => handleCreateWidget(msg.widgetAction!)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add to Dashboard
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

      {/* Quick prompts — only on first message */}
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
          placeholder="Ask me to create charts..."
          disabled={loading}
          className="flex-1 h-9 text-sm"
        />
        <Button
          type="submit"
          size="sm"
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
