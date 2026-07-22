'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, CheckCircle2, Loader2, Maximize2, Minimize2, Send, Sparkles, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import { PLATFORM_ASSISTANT_INTENT_STORAGE_KEY, type PlatformAssistantAction } from '@/lib/ai/platform-assistant-contract'

interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  platformAction?: PlatformAssistantAction | null
}

const INITIAL_MESSAGE: AssistantMessage = {
  role: 'assistant',
  content: 'I’m available throughout DashboardOS. Ask how a page works, what to do next, or why an item is blocking publishing.',
}

const QUICK_PROMPTS = [
  'What should I do next?',
  'Explain this page',
  'Plan a dashboard for me',
  'Why can publishing be blocked?',
]

function cleanAssistantMessage(content: string) {
  return content.replace(/```platform_action[\s\S]*?```/g, '').trim()
}

function localHelpAnswer(prompt: string, pagePath: string, hasScope: boolean) {
  const normalized = prompt.toLowerCase()
  const scopeNote = hasScope
    ? ''
    : ' Select a tenant project first so I can use project-specific context.'
  if (normalized.includes('publish')) {
    return `Publishing creates an immutable client release. Resolve schema, semantic, dataset, chart, and preview blockers first, then explicitly approve the release.${scopeNote}`
  }
  if (normalized.includes('data source') || normalized.includes('database')) {
    return `Connect a read-only database in Data Sources, test the connection, fetch its schema, and confirm which business tables should be included.${scopeNote}`
  }
  if (normalized.includes('semantic')) {
    return `The semantic layer gives database fields business names, roles, metrics, privacy rules, and relationships. Review only low-confidence or sensitive decisions; high-confidence mappings can remain automated.${scopeNote}`
  }
  if (normalized.includes('dataset')) {
    return `A dataset is the governed query shape behind one or more charts. Autopilot should generate it from approved fields and metrics; use the dataset page for advanced inspection.${scopeNote}`
  }
  if (normalized.includes('chart') || normalized.includes('dashboard')) {
    return `Describe the required dashboard in Autopilot, including audience, chart count, and preferred visuals. It maps the brief to governed semantics, a dataset, and editable charts, while keeping semantic approval and publishing under human control.${scopeNote}`
  }
  if (normalized.includes('next')) {
    return `You are on ${pagePath}. Help with the current task and keep answers concise.${scopeNote}`
  }
  return `You are on ${pagePath}. I can explain data sources, semantic models, datasets, charts, dashboard briefs, validation, and publishing.${scopeNote}`
}

function localHelpAction(prompt: string, stage: string): PlatformAssistantAction | null {
  const normalized = prompt.toLowerCase()
  const requestInstruction = /create|generate|build|plan|compose/.test(normalized) ? prompt : undefined
  const requestsDashboardBuild = Boolean(requestInstruction) && /dashboard|brief|autopilot/.test(normalized)
  if (requestsDashboardBuild) return { action: 'navigate_workflow', target: 'autopilot', path: '/admin/autopilot', label: 'Open Autopilot', reason: 'Turn this brief into governed semantics, a dataset, and editable chart drafts.', instruction: requestInstruction }
  if (normalized.includes('semantic')) return { action: 'navigate_workflow', target: 'semantic_model', path: '/admin/semantic-model', label: 'Open semantic workbench', reason: 'Review or generate the governed business model.', ...(requestInstruction ? { instruction: requestInstruction } : {}) }
  if (normalized.includes('dataset')) return { action: 'navigate_workflow', target: 'datasets', path: '/admin/datasets', label: 'Open dataset workbench', reason: 'Generate a governed dataset proposal from an approved model.', ...(requestInstruction ? { instruction: requestInstruction } : {}) }
  if (normalized.includes('chart') || normalized.includes('dashboard')) return { action: 'navigate_workflow', target: 'charts', path: '/admin/charts', label: 'Open dashboard composer', reason: 'Generate an editable chart suite from the business requirement.', ...(requestInstruction ? { instruction: requestInstruction } : {}) }
  if (normalized.includes('publish')) return { action: 'navigate_workflow', target: 'publishing', path: '/admin/publishing', label: 'Open publishing', reason: 'Inspect readiness and explicitly approve a release.' }
  if (normalized.includes('database') || normalized.includes('data source')) return { action: 'navigate_workflow', target: 'data_sources', path: '/admin/data-sources', label: 'Open data sources', reason: 'Attach or inspect the project database inventory.' }
  if (!normalized.includes('next')) return null
  if (stage === 'user' || stage === 'tenant') return { action: 'navigate_workflow', target: 'data_sources', path: '/admin/data-sources', label: 'Start with a data source', reason: 'Attach the project database before modeling analytics.' }
  if (stage === 'data_source') return { action: 'navigate_workflow', target: 'data_sources', path: '/admin/data-sources', label: 'Continue with data sources', reason: 'Confirm the database and selected table inventory.' }
  if (stage === 'semantic_model') return { action: 'navigate_workflow', target: 'autopilot', path: '/admin/autopilot', label: 'Continue in Autopilot', reason: 'Generate the governed model and pause only for semantic approval.' }
  if (stage === 'charts') return { action: 'navigate_workflow', target: 'autopilot', path: '/admin/autopilot', label: 'Continue in Autopilot', reason: 'Generate the dataset and editable chart suite from one brief.' }
  if (stage === 'dashboard') return { action: 'navigate_workflow', target: 'charts', path: '/admin/charts', label: 'Continue with charts', reason: 'Compose and review editable chart drafts.' }
  return { action: 'navigate_workflow', target: 'publishing', path: '/admin/publishing', label: 'Review publishing readiness', reason: 'Validate the release before explicit publication.' }
}

export function PlatformAssistantDock() {
  const pathname = usePathname()
  const router = useRouter()
  const scope = useScopedBuilderStore(state => state.scope)
  const stage = useScopedBuilderStore(state => state.stage)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([INITIAL_MESSAGE])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [loading, messages])

  const sendMessage = async (value: string) => {
    const prompt = value.trim()
    if (!prompt || loading) return
    const userMessage: AssistantMessage = { role: 'user', content: prompt }
    const history = [...messages, userMessage]
    setMessages(history)
    setInput('')

    if (!scope) {
      setMessages(current => [...current, { role: 'assistant', content: localHelpAnswer(prompt, pathname, false) }])
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.slice(-20),
          context: {
            tenantId: scope.tenantId,
            projectId: scope.projectId,
            assistantMode: 'platform_help',
            pagePath: pathname,
            workflowStage: stage,
          },
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || typeof payload?.message !== 'string') {
        throw new Error(typeof payload?.error === 'string' ? payload.error : `Assistant request failed (${response.status})`)
      }
      setMessages(current => [...current, {
        role: 'assistant',
        content: payload.message,
        platformAction: payload.platformAction ?? null,
      }])
    } catch {
      setMessages(current => [...current, {
        role: 'assistant',
        content: localHelpAnswer(prompt, pathname, true),
        platformAction: localHelpAction(prompt, stage),
      }])
    } finally {
      setLoading(false)
    }
  }

  const applyAction = (action: PlatformAssistantAction) => {
    if (!scope) return
    window.sessionStorage.setItem(PLATFORM_ASSISTANT_INTENT_STORAGE_KEY, JSON.stringify({
      ...action,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      createdAt: new Date().toISOString(),
    }))
    router.push(action.path)
  }

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 h-11 rounded-md bg-[var(--dos-accent-primary)] px-4 text-[var(--dos-background-deep)] shadow-lg hover:bg-[var(--dos-accent-primary-hover)]"
      >
        <Sparkles className="mr-2 h-4 w-4" /> Ask DashboardOS
      </Button>
    )
  }

  return (
    <aside
      aria-label="DashboardOS assistant"
      className="fixed bottom-5 right-5 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-[color:var(--dos-border-mid)] bg-[var(--dos-background-deep)] text-[var(--dos-text-primary)] shadow-2xl"
      style={{ height: minimized ? 'auto' : 'min(620px, calc(100vh - 6rem))' }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--dos-border-soft)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--dos-accent-primary-soft)] text-[var(--dos-accent-primary)]">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">DashboardOS Assistant</p>
            <p className="truncate text-[10px] text-[var(--dos-text-muted)]">{pathname} · {stage.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMinimized(value => !value)} aria-label={minimized ? 'Expand assistant' : 'Minimize assistant'}>
            {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close assistant">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[90%] space-y-2">
                  <p className={[
                    'whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm leading-6',
                    message.role === 'user'
                      ? 'border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary)] text-[var(--dos-background-deep)]'
                      : 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] text-[var(--dos-text-secondary)]',
                  ].join(' ')}>{cleanAssistantMessage(message.content)}</p>
                  {message.platformAction ? (
                    <div className="rounded-lg border border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] p-3 text-left">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--dos-text-primary)]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--dos-accent-primary)]" /> Proposed next action
                      </div>
                      <p className="mt-2 text-sm font-medium">{message.platformAction.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--dos-text-muted)]">{message.platformAction.reason}</p>
                      {message.platformAction.instruction ? <p className="mt-2 rounded-md bg-[var(--dos-background-deep)] px-2 py-1.5 text-[11px] text-[var(--dos-text-secondary)]">Prefill: {message.platformAction.instruction}</p> : null}
                      <Button size="sm" className="mt-3" onClick={() => applyAction(message.platformAction as PlatformAssistantAction)}>
                        Open workspace
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-[var(--dos-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking with current project context…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length === 1 && (
            <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--dos-border-soft)] px-3 py-2">
              {QUICK_PROMPTS.map(prompt => (
                <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} className="rounded-full border border-[color:var(--dos-border-soft)] px-2.5 py-1 text-[10px] text-[var(--dos-text-secondary)] hover:bg-[var(--dos-surface-muted)]">
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex gap-2 border-t border-[color:var(--dos-border-soft)] p-3"
            onSubmit={event => {
              event.preventDefault()
              void sendMessage(input)
            }}
          >
            <Input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask how to use DashboardOS…" disabled={loading} />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </>
      )}
    </aside>
  )
}
