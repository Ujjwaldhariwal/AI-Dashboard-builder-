'use client'

import { FileText, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ReportSpec } from '@/lib/ai/report-composer'

type ProposalResponse = {
  proposalId: string | null
  proposal: ReportSpec
  validation: {
    state: 'valid' | 'warning'
    issues: Array<{ code: string; message: string }>
  }
  source: 'ai' | 'deterministic'
  warning?: string
}

export function ReportComposerPanel({
  projectId,
  projectName,
  disabled = false,
}: {
  projectId: string
  projectName: string
  disabled?: boolean
}) {
  const [instruction, setInstruction] = useState('Create a concise monthly executive report with trends, comparisons, and a methodology appendix.')
  const [title, setTitle] = useState(`${projectName || 'Executive'} report`)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProposalResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function composeReport() {
    if (!projectId || instruction.trim().length < 3) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/report-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          title,
          organizationName: projectName || 'DashboardOS',
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.proposal) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Report proposal failed.')
      }
      setResult(payload as ProposalResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Report proposal failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]" data-testid="report-composer-panel">
      <CardHeader className="border-b border-[color:var(--dos-border-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base text-[var(--dos-text-primary)]">
            <FileText className="h-4 w-4 text-[var(--dos-accent-primary)]" />
            Governed report composer
          </CardTitle>
          <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[var(--dos-text-muted)]">
            Review required
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-title">Report title</Label>
            <Input
              id="report-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={160}
              disabled={disabled || loading || !projectId}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-requirement">Report requirement</Label>
            <Textarea
              id="report-requirement"
              value={instruction}
              onChange={event => setInstruction(event.target.value)}
              rows={4}
              maxLength={4_000}
              disabled={disabled || loading || !projectId}
            />
          </div>
          <Button
            onClick={() => void composeReport()}
            disabled={disabled || loading || !projectId || title.trim().length < 2 || instruction.trim().length < 3}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Compose reviewed outline
          </Button>
          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-[color:var(--dos-danger)] bg-[var(--dos-danger-soft)] p-3 text-xs text-[var(--dos-danger-text)]" role="alert">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
          {result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[color:var(--dos-accent-primary)] text-[var(--dos-accent-primary)]">
                  {result.source === 'ai' ? 'AI proposal' : 'Rules fallback'}
                </Badge>
                <Badge variant="outline">{result.validation.state}</Badge>
              </div>
              <h3 className="text-sm font-semibold text-[var(--dos-text-primary)]">{result.proposal.title}</h3>
              <p className="text-xs leading-5 text-[var(--dos-text-muted)]">{result.proposal.summary}</p>
              <dl className="grid grid-cols-3 gap-2 border-y border-[color:var(--dos-border-soft)] py-3 text-center">
                <div><dt className="text-[10px] text-[var(--dos-text-muted)]">Pages</dt><dd className="font-mono text-lg">{result.proposal.pages.length}</dd></div>
                <div><dt className="text-[10px] text-[var(--dos-text-muted)]">Sections</dt><dd className="font-mono text-lg">{result.proposal.sections.length}</dd></div>
                <div><dt className="text-[10px] text-[var(--dos-text-muted)]">Confidence</dt><dd className="font-mono text-lg">{Math.round(result.proposal.confidence * 100)}%</dd></div>
              </dl>
              <div className="space-y-2">
                {result.proposal.pages.map(page => (
                  <div key={page.id} className="rounded border border-[color:var(--dos-border-soft)] px-3 py-2 text-xs">
                    <span className="font-medium text-[var(--dos-text-primary)]">{page.title}</span>
                    <span className="ml-2 text-[var(--dos-text-muted)]">{page.sectionIds.length} sections</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] leading-4 text-[var(--dos-text-muted)]">
                Saved as an awaiting-review proposal. Narrative claims remain empty until deterministic facts are attached.
              </p>
            </div>
          ) : (
            <div className="flex min-h-48 flex-col justify-center">
              <p className="text-sm font-semibold text-[var(--dos-text-primary)]">No report proposal yet</p>
              <p className="mt-2 text-xs leading-5 text-[var(--dos-text-muted)]">
                The composer can use only published datasets backed by approved semantic models.
              </p>
            </div>
          )}
        </aside>
      </CardContent>
    </Card>
  )
}
