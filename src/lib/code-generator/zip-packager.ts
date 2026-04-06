// Module: ZipPackager
import JSZip from 'jszip'
import { EXPORTED_CHART_TYPES, type GeneratedFileMap } from './template-generator'

interface AIExportConfig {
  enabled: boolean
  provider: 'google' | 'openai' | 'anthropic'
  apiKey: string
  features: {
    dataTransformer: boolean
    uiDesigner: boolean
    pdfReport: boolean
    chat: boolean
  }
}

interface DashboardExportConfigLike {
  projectConfig?: {
    aiExportConfig?: Partial<AIExportConfig>
  }
}

const AI_DEPENDENCY_VERSIONS = {
  ai: '^6.0.145',
  google: '^3.0.57',
  zod: '^3.25.76',
  reactPdf: '^4.3.2',
} as const

function verifyChartTypeCoverage(files: GeneratedFileMap) {
  const widgetChartSource = files['src/components/WidgetChart.tsx'] ?? ''
  const missing = EXPORTED_CHART_TYPES.filter((chartType) => {
    if (chartType === 'table') {
      return !widgetChartSource.includes("widget.type === 'table'")
    }
    return !widgetChartSource.includes(`case '${chartType}'`)
  })
  if (missing.length > 0) {
    throw new Error(`ZIP export aborted. Missing chart handlers: ${missing.join(', ')}`)
  }
}

function parseExportConfig(files: GeneratedFileMap): DashboardExportConfigLike | null {
  const configSource = files['src/lib/config.ts']
  if (!configSource) return null

  const marker = 'export const dashboardConfig: DashboardConfig = '
  const startIndex = configSource.indexOf(marker)
  if (startIndex < 0) return null

  const jsonStart = startIndex + marker.length
  const jsonEnd = configSource.indexOf(' as const', jsonStart)
  if (jsonEnd < 0) return null

  const jsonChunk = configSource.slice(jsonStart, jsonEnd).trim()
  try {
    return JSON.parse(jsonChunk) as DashboardExportConfigLike
  } catch {
    return null
  }
}

function normalizeAIExportConfig(files: GeneratedFileMap): AIExportConfig | null {
  const parsed = parseExportConfig(files)
  const raw = parsed?.projectConfig?.aiExportConfig
  if (!raw || raw.enabled !== true) return null

  const provider = raw.provider === 'openai' || raw.provider === 'anthropic'
    ? raw.provider
    : 'google'

  return {
    enabled: true,
    provider,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    features: {
      dataTransformer: raw.features?.dataTransformer !== false,
      uiDesigner: raw.features?.uiDesigner !== false,
      pdfReport: raw.features?.pdfReport === true,
      chat: raw.features?.chat === true,
    },
  }
}

function injectAIDependencies(files: GeneratedFileMap, aiConfig: AIExportConfig) {
  const packageSource = files['package.json']
  if (!packageSource) return

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(packageSource) as Record<string, unknown>
  } catch {
    return
  }

  const dependencies: Record<string, string> = {
    ...((parsed.dependencies as Record<string, string> | undefined) ?? {}),
    ai: AI_DEPENDENCY_VERSIONS.ai,
    '@ai-sdk/google': AI_DEPENDENCY_VERSIONS.google,
    zod: AI_DEPENDENCY_VERSIONS.zod,
  }

  if (aiConfig.features.pdfReport) {
    dependencies['@react-pdf/renderer'] = AI_DEPENDENCY_VERSIONS.reactPdf
  }

  parsed.dependencies = dependencies
  files['package.json'] = JSON.stringify(parsed, null, 2)
}

function injectAIEnv(files: GeneratedFileMap, aiConfig: AIExportConfig) {
  const apiKey = aiConfig.apiKey.replace(/[\r\n]+/g, '').trim()
  const existing = files['.env.local'] ?? ''
  const trimmed = existing.trimEnd()
  const suffix = [
    `NEXT_PUBLIC_AI_PROVIDER=${aiConfig.provider}`,
    '# Client AI Key injected during export',
    `AI_API_KEY=${apiKey}`,
  ].join('\n')

  files['.env.local'] = trimmed.length > 0
    ? `${trimmed}\n${suffix}\n`
    : `${suffix}\n`
}

function injectAIFiles(files: GeneratedFileMap, aiConfig: AIExportConfig) {
  files['src/lib/ai/agent-schemas.ts'] = AGENT_SCHEMAS_FILE
  files['src/lib/ai/agent-client.ts'] = AGENT_CLIENT_FILE

  if (aiConfig.features.dataTransformer) {
    files['src/app/api/agents/transform/route.ts'] = AGENT_TRANSFORM_ROUTE_FILE
  }
  if (aiConfig.features.uiDesigner) {
    files['src/app/api/agents/ui/route.ts'] = AGENT_UI_ROUTE_FILE
  }
  if (aiConfig.features.pdfReport) {
    files['src/app/api/agents/report/route.ts'] = AGENT_REPORT_ROUTE_FILE
    files['src/components/viewer/pdf/pdf-download-button.tsx'] = PDF_DOWNLOAD_BUTTON_FILE
    files['src/components/viewer/pdf/report-document.tsx'] = PDF_REPORT_DOCUMENT_FILE
  }
}

function prepareFilesForExport(files: GeneratedFileMap): GeneratedFileMap {
  const prepared: GeneratedFileMap = { ...files }
  const aiConfig = normalizeAIExportConfig(prepared)

  if (!aiConfig?.enabled) {
    return prepared
  }

  injectAIDependencies(prepared, aiConfig)
  injectAIEnv(prepared, aiConfig)
  injectAIFiles(prepared, aiConfig)
  return prepared
}

export async function packageProjectAsZip(files: GeneratedFileMap): Promise<Blob> {
  verifyChartTypeCoverage(files)
  const prepared = prepareFilesForExport(files)
  const zip = new JSZip()

  Object.entries(prepared).forEach(([filePath, content]) => {
    zip.file(filePath, content)
  })

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

const AGENT_SCHEMAS_FILE = `import { z } from 'zod'

export const LabelFormatSchema = z.enum(['currency', 'percent'])

export const WidgetStyleSchema = z.object({
  colors: z.array(z.string()),
  tooltipBg: z.string().optional(),
  tooltipBorder: z.string().optional(),
  labelFormat: LabelFormatSchema.optional(),
  barRadius: z.number().optional(),
  showLegend: z.boolean().optional(),
  showGrid: z.boolean().optional(),
}).strict()

export const TransformMathOperatorSchema = z.enum(['+', '-', '*', '/'])
export const TransformFilterOperatorSchema = z.enum(['>', '<', '=', '!=', '>=', '<='])
export const TransformSortOrderSchema = z.enum(['asc', 'desc'])

export const TransformOpSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('parse_number'),
    field: z.string(),
  }).strict(),
  z.object({
    type: z.literal('concat'),
    fields: z.array(z.string()),
    separator: z.string(),
    outputField: z.string(),
  }).strict(),
  z.object({
    type: z.literal('rename'),
    from: z.string(),
    to: z.string(),
  }).strict(),
  z.object({
    type: z.literal('math'),
    field: z.string(),
    operator: TransformMathOperatorSchema,
    value: z.number(),
    outputField: z.string(),
  }).strict(),
  z.object({
    type: z.literal('percent_of_total'),
    field: z.string(),
    outputField: z.string(),
  }).strict(),
  z.object({
    type: z.literal('filter_rows'),
    field: z.string(),
    operator: TransformFilterOperatorSchema,
    value: z.unknown(),
  }).strict(),
  z.object({
    type: z.literal('sort'),
    field: z.string(),
    order: TransformSortOrderSchema,
  }).strict(),
  z.object({
    type: z.literal('limit'),
    count: z.number(),
  }).strict(),
])

export const ReportInsightSchema = z.object({
  executiveSummary: z.string(),
  anomalies: z.array(z.string()),
  widgetInsights: z.record(z.string(), z.string()),
})

export type TransformOp = z.infer<typeof TransformOpSchema>
export type WidgetStyle = z.infer<typeof WidgetStyleSchema>
export type ReportInsight = z.infer<typeof ReportInsightSchema>
`

const AGENT_CLIENT_FILE = `import { z } from 'zod'
import { ReportInsightSchema, TransformOpSchema, WidgetStyleSchema } from '@/lib/ai/agent-schemas'

const TransformAgentResponseSchema = z.object({
  operations: z.array(TransformOpSchema),
}).strict()

const UiAgentResponseSchema = z.object({
  style: WidgetStyleSchema,
}).strict()

const ReportAgentResponseSchema = z.object({
  report: ReportInsightSchema,
}).strict()

async function readJsonSafe(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const maybeError = (payload as { error?: unknown }).error
    if (typeof maybeError === 'string' && maybeError.trim().length > 0) {
      return maybeError
    }
  }
  return fallback
}

export async function askDataTransformer(prompt: string, sampleData: unknown[]) {
  const response = await fetch('/api/agents/transform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sampleData }),
  })
  const payload = await readJsonSafe(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'AI transform request failed'))
  }
  const parsed = TransformAgentResponseSchema.safeParse(payload)
  if (!parsed.success) throw new Error('Invalid AI transform response')
  return parsed.data.operations
}

export async function askUiDesigner(prompt: string, currentStyle: unknown) {
  const response = await fetch('/api/agents/ui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentStyle }),
  })
  const payload = await readJsonSafe(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'AI style request failed'))
  }
  const parsed = UiAgentResponseSchema.safeParse(payload)
  if (!parsed.success) throw new Error('Invalid AI style response')
  return parsed.data.style
}

export async function askReportGenerator(dashboardTitle: string, widgetsData: unknown[]) {
  const response = await fetch('/api/agents/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dashboardTitle, widgetsData }),
  })
  const payload = await readJsonSafe(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'AI report request failed'))
  }
  const parsed = ReportAgentResponseSchema.safeParse(payload)
  if (!parsed.success) throw new Error('Invalid AI report response')
  return parsed.data.report
}
`

const AGENT_TRANSFORM_ROUTE_FILE = `import { NextRequest, NextResponse } from 'next/server'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { TransformOpSchema } from '@/lib/ai/agent-schemas'

const TransformAgentRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  sampleData: z.array(z.unknown()),
}).strict()

const TransformAgentResponseSchema = z.object({
  operations: z.array(TransformOpSchema),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { operations: [], error: 'AI_API_KEY is not configured' },
        { status: 500 },
      )
    }

    const body = await req.json().catch(() => null)
    if (body === null) {
      return NextResponse.json(
        { operations: [], error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parsed = TransformAgentRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { operations: [], error: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const google = createGoogleGenerativeAI({ apiKey })
    const { prompt, sampleData } = parsed.data
    const samplePreview = JSON.stringify(sampleData.slice(0, 25), null, 2)

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: TransformAgentResponseSchema,
      system: \`You are a data transformation planner for dashboard charts.

Return only valid JSON matching the provided schema.

Rules:
- Output an ordered "operations" array of TransformOp objects.
- Use only these operation types:
  parse_number, concat, rename, math, percent_of_total, filter_rows, sort, limit.
- Use exact field names from sample data when possible.
- Keep operations minimal and deterministic.
- Never include extra keys outside the schema.
- Never return prose.\`,
      prompt: \`User goal:
\${prompt}

Sample data rows:
\${samplePreview}

Produce a TransformOp plan that transforms rows to satisfy the user goal.\`,
    })

    return NextResponse.json({ operations: result.object.operations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transform agent failed'
    return NextResponse.json(
      { operations: [], error: message },
      { status: 500 },
    )
  }
}
`

const AGENT_UI_ROUTE_FILE = `import { NextRequest, NextResponse } from 'next/server'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { WidgetStyleSchema } from '@/lib/ai/agent-schemas'

const ENTERPRISE_COLORS = ['#0EA5E9', '#10B981', '#F59E0B', '#6366F1', '#14B8A6']

const UiAgentRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  currentStyle: z.unknown(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { style: null, error: 'AI_API_KEY is not configured' },
        { status: 500 },
      )
    }

    const body = await req.json().catch(() => null)
    if (body === null) {
      return NextResponse.json(
        { style: null, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parsed = UiAgentRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { style: null, error: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const google = createGoogleGenerativeAI({ apiKey })
    const { prompt, currentStyle } = parsed.data
    const currentStylePreview = JSON.stringify(currentStyle ?? {}, null, 2)

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: WidgetStyleSchema,
      system: \`You are an expert enterprise chart UI designer.

Return only valid JSON matching the WidgetStyle schema.

Rules:
- Only output these keys:
  colors, tooltipBg, tooltipBorder, labelFormat, barRadius, showLegend, showGrid.
- "labelFormat" can only be "currency" or "percent" when present.
- Never output unknown keys.
- Prefer enterprise-quality palettes based on or harmonized with:
  \${ENTERPRISE_COLORS.join(', ')}
- colors must be an array of readable hex color strings.
- Never return prose.\`,
      prompt: \`User style request:
\${prompt}

Current style:
\${currentStylePreview}

Return the full updated WidgetStyle object.\`,
    })

    return NextResponse.json({ style: result.object })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UI agent failed'
    return NextResponse.json(
      { style: null, error: message },
      { status: 500 },
    )
  }
}
`

const AGENT_REPORT_ROUTE_FILE = `import { NextRequest, NextResponse } from 'next/server'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { ReportInsightSchema } from '@/lib/ai/agent-schemas'

const ReportAgentRequestSchema = z.object({
  dashboardTitle: z.string().min(1, 'dashboardTitle is required'),
  widgetsData: z.array(z.unknown()),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { report: null, error: 'AI_API_KEY is not configured' },
        { status: 500 },
      )
    }

    const body = await req.json().catch(() => null)
    if (body === null) {
      return NextResponse.json(
        { report: null, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parsed = ReportAgentRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { report: null, error: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const google = createGoogleGenerativeAI({ apiKey })
    const { dashboardTitle, widgetsData } = parsed.data
    const widgetsPreview = JSON.stringify(widgetsData.slice(0, 40), null, 2)

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: ReportInsightSchema,
      system: \`You are a Senior Data Analyst preparing a professional dashboard report.

Return only valid JSON matching the schema exactly.

Guidelines:
- executiveSummary: concise and executive-friendly (3-5 sentences).
- anomalies: actionable bullets for spikes, drops, outliers, or concerning shifts.
- widgetInsights: include one insight for each widget id in the input.
- Never return markdown or prose outside JSON.\`,
      prompt: \`Dashboard title:
\${dashboardTitle}

Widgets data summary:
\${widgetsPreview}

Analyze this dashboard and produce executive summary, anomalies, and per-widget insights.\`,
    })

    return NextResponse.json({ report: result.object })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report agent failed'
    return NextResponse.json(
      { report: null, error: message },
      { status: 500 },
    )
  }
}
`

const PDF_DOWNLOAD_BUTTON_FILE = `'use client'

import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { askReportGenerator } from '@/lib/ai/agent-client'
import { ReportDocument } from '@/components/viewer/pdf/report-document'

interface PdfWidgetInput {
  id: string
  title: string
  type?: string
  endpointId?: string
  dataMapping?: unknown
  style?: unknown
  data?: unknown
}

interface PdfDownloadButtonProps {
  dashboardTitle: string
  widgets: PdfWidgetInput[]
}

export function PdfDownloadButton({ dashboardTitle, widgets }: PdfDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerateReport = async () => {
    if (!dashboardTitle.trim() || widgets.length === 0) return
    setIsGenerating(true)
    try {
      const widgetsData = widgets.map((widget) => ({
        id: widget.id,
        title: widget.title,
        type: widget.type,
        endpointId: widget.endpointId,
        dataMapping: widget.dataMapping,
        style: widget.style,
        data: Array.isArray(widget.data) ? widget.data.slice(0, 20) : widget.data,
      }))

      const insights = await askReportGenerator(dashboardTitle, widgetsData)
      const reportDocument = (
        <ReportDocument
          dashboardTitle={dashboardTitle}
          insights={insights}
          widgets={widgets.map((widget) => ({ id: widget.id, title: widget.title }))}
        />
      )

      const blob = await pdf(reportDocument).toBlob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = 'ai-report.pdf'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(objectUrl)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleGenerateReport()}
      disabled={isGenerating}
      style={{
        border: '1px solid #e2e8f0',
        background: '#ffffff',
        color: '#0f172a',
        borderRadius: 8,
        padding: '0.45rem 0.75rem',
        fontSize: '0.8rem',
        fontWeight: 600,
        cursor: isGenerating ? 'not-allowed' : 'pointer',
      }}
    >
      {isGenerating ? 'Generating...' : 'Generate AI Report'}
    </button>
  )
}
`

const PDF_REPORT_DOCUMENT_FILE = `import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { ReportInsight } from '@/lib/ai/agent-schemas'

interface ReportWidget {
  id: string
  title: string
}

interface ReportDocumentProps {
  dashboardTitle: string
  insights: ReportInsight
  widgets: ReportWidget[]
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 42,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: 11,
    lineHeight: 1.45,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#0F172A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 22,
  },
  section: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    border: '1 solid #E2E8F0',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#1E293B',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 11,
    color: '#334155',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bullet: {
    width: 10,
    fontSize: 11,
    color: '#0F172A',
  },
  bulletText: {
    flex: 1,
    fontSize: 11,
    color: '#334155',
  },
  widgetHeader: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: '1 solid #E2E8F0',
  },
  widgetTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0F172A',
  },
  widgetId: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },
  insightCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    border: '1 solid #E2E8F0',
  },
  insightLabel: {
    fontSize: 9,
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  insightText: {
    fontSize: 11,
    color: '#1E293B',
  },
  emptyText: {
    fontSize: 11,
    color: '#64748B',
  },
  footer: {
    position: 'absolute',
    left: 42,
    right: 42,
    bottom: 20,
    fontSize: 9,
    color: '#94A3B8',
    textAlign: 'center',
  },
})

export function ReportDocument({
  dashboardTitle,
  insights,
  widgets,
}: ReportDocumentProps) {
  const generatedAt = new Date().toLocaleString()
  const anomalies = insights.anomalies ?? []

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{dashboardTitle}</Text>
        <Text style={styles.subtitle}>AI Report - Generated {generatedAt}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.summaryText}>{insights.executiveSummary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Anomalies</Text>
          {anomalies.length > 0 ? (
            anomalies.map((item, index) => (
              <View style={styles.bulletRow} key={\`anomaly-\${index}\`}>
                <Text style={styles.bullet}>-</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No significant anomalies detected.</Text>
          )}
        </View>

        <Text style={styles.footer}>Confidential - Generated by AI Dashboard Builder</Text>
      </Page>

      {widgets.map((widget) => (
        <Page key={widget.id} size="A4" style={styles.page}>
          <View style={styles.widgetHeader}>
            <Text style={styles.widgetTitle}>{widget.title}</Text>
            <Text style={styles.widgetId}>Widget ID: {widget.id}</Text>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>AI Insight</Text>
            <Text style={styles.insightText}>
              {insights.widgetInsights[widget.id] ?? 'No specific insight was generated for this widget.'}
            </Text>
          </View>

          <Text style={styles.footer}>Confidential - Generated by AI Dashboard Builder</Text>
        </Page>
      ))}
    </Document>
  )
}
`
