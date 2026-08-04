'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Database, Loader2, MessageSquare, Send, Sparkles, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  normalizeNaturalLanguageQueryResult,
  type NaturalLanguageMetric,
  type NaturalLanguageQueryResult,
} from '@/lib/ai/natural-language-query-result'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  result?: NaturalLanguageQueryResult
}

type NaturalLanguageQueryProps = {
  data: ReadonlyArray<Record<string, unknown>>
  onQuery: (query: string) => Promise<unknown>
}

const suggestedQueries = [
  'Which metrics changed the most?',
  'Explain the strongest trend',
  'Compare performance by category',
  'Find unusual patterns and likely causes',
]

function messageId(role: Message['role']) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isMetric(value: NaturalLanguageQueryResult['data']): value is NaturalLanguageMetric {
  return Boolean(value && !Array.isArray(value) && 'metric' in value)
}

export function NaturalLanguageQuery({ data, onQuery }: NaturalLanguageQueryProps) {
  const fieldCount = data[0] ? Object.keys(data[0]).length : 0
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: data.length
        ? `I can analyze ${data.length.toLocaleString()} preview rows across ${fieldCount} fields using the governed AI query service. Ask for comparisons, trends, anomalies, or an executive explanation.`
        : 'Connect or preview a governed dataset, then ask for comparisons, trends, anomalies, or an executive explanation.',
    },
  ])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    setMessages(previous => {
      if (previous.length !== 1 || previous[0]?.id !== 'assistant-welcome') return previous
      return [{
        ...previous[0],
        content: data.length
          ? `I can analyze ${data.length.toLocaleString()} released preview rows across ${fieldCount} fields. Ask for comparisons, trends, anomalies, or an executive explanation.`
          : 'Load a released chart, then ask for comparisons, trends, anomalies, or an executive explanation.',
      }]
    })
  }, [data.length, fieldCount])

  const processNaturalLanguageQuery = async (query: string) => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery || isProcessing) return

    setIsProcessing(true)
    setMessages(previous => [
      ...previous,
      { id: messageId('user'), role: 'user', content: normalizedQuery },
    ])

    try {
      const result = normalizeNaturalLanguageQueryResult(await onQuery(normalizedQuery))
      setMessages(previous => [
        ...previous,
        {
          id: messageId('assistant'),
          role: 'assistant',
          content: result.content,
          result,
        },
      ])
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The governed AI query could not be completed.'
      setMessages(previous => [
        ...previous,
        {
          id: messageId('assistant'),
          role: 'assistant',
          content: `${detail} No result was fabricated. Check the approved dataset and AI provider, then try again.`,
        },
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const query = input.trim()
    if (!query || isProcessing) return
    setInput('')
    void processNaturalLanguageQuery(query)
  }

  return (
    <Card className="flex min-h-[32rem] flex-col border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--dos-accent-primary)]" />
          <CardTitle className="text-[var(--dos-text-primary)]">AI Data Assistant</CardTitle>
          <Badge variant="secondary" className="ml-auto gap-1">
            <Database className="h-3 w-3" />
            Governed AI
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          <AnimatePresence initial={false}>
            {messages.map(message => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[var(--dos-accent-primary-soft)]">
                    <Sparkles className="h-4 w-4 text-[var(--dos-accent-primary)]" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>

                  {message.result?.intent && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Governed intent: {message.result.intent.summary}
                    </p>
                  )}

                  {message.result?.confidence !== undefined && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Confidence {Math.round(message.result.confidence * 100)}%
                    </div>
                  )}

                  {message.result?.warnings.map(warning => (
                    <p key={warning} className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      {warning}
                    </p>
                  ))}

                  {Array.isArray(message.result?.data) && message.result.data.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-md border bg-card">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            {Object.keys(message.result.data[0]).map(key => (
                              <th key={key} className="border-b p-2 text-left font-medium">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {message.result.data.slice(0, 5).map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {Object.keys(row).map(key => (
                                <td key={key} className="border-b p-2 last:border-b-0">
                                  {String(row[key] ?? '—')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {isMetric(message.result?.data) && (
                    <div className="mt-3 rounded-lg border bg-card p-4">
                      {message.result.data.label && (
                        <div className="mb-1 text-xs text-muted-foreground">{message.result.data.label}</div>
                      )}
                      <div className="text-3xl font-bold text-primary">{message.result.data.metric}</div>
                      {message.result.data.count !== undefined && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Grounded in {message.result.data.count.toLocaleString()} records
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary">
                    <MessageSquare className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isProcessing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--dos-accent-primary-soft)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--dos-accent-primary)]" />
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm text-muted-foreground">Running governed analysis…</p>
              </div>
            </motion.div>
          )}
        </div>

        {messages.length === 1 && data.length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-2 text-xs text-muted-foreground">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQueries.map(query => (
                <Button
                  key={query}
                  variant="outline"
                  size="sm"
                  onClick={() => void processNaturalLanguageQuery(query)}
                  disabled={isProcessing}
                  className="text-xs"
                >
                  {query}
                </Button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder={data.length ? 'Ask a grounded question about this dataset…' : 'Preview a dataset to enable analysis'}
              disabled={isProcessing || data.length === 0}
              className="flex-1"
            />
            <Button type="submit" disabled={isProcessing || data.length === 0 || !input.trim()} aria-label="Run AI query">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
