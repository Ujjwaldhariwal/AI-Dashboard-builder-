import { z } from 'zod'

export const REPORT_SPEC_VERSION = 'dashboardos.report.spec.v1' as const

const LocalIdSchema = z.string().regex(
  /^[a-z][a-z0-9_-]{1,63}$/,
  'Use a stable lowercase local ID.',
)
const ReferenceIdSchema = z.string().uuid()
const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

export const ReportDatasetEvidenceSchema = z.object({
  id: ReferenceIdSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().default(null),
  fields: z.array(z.object({
    id: ReferenceIdSchema,
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(60),
  }).strict()).max(60),
  metrics: z.array(z.object({
    id: ReferenceIdSchema,
    name: z.string().trim().min(1).max(120),
    aggregation: z.string().trim().min(1).max(60),
  }).strict()).max(30),
}).strict()

export const ReportFactSchema = z.object({
  id: LocalIdSchema,
  datasetId: ReferenceIdSchema,
  metricId: ReferenceIdSchema.nullable().default(null),
  label: z.string().trim().min(1).max(160),
  value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
  formattedValue: z.string().trim().max(160).nullable().default(null),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/i),
  computedAt: z.string().datetime(),
}).strict()

const ReportFilterSchema = z.object({
  id: LocalIdSchema,
  datasetId: ReferenceIdSchema,
  fieldId: ReferenceIdSchema,
  operator: z.enum(['eq', 'not_eq', 'in', 'contains', 'gte', 'lte', 'between']),
  value: z.union([
    z.string().max(240),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string().max(240), z.number(), z.boolean()])).min(1).max(24),
  ]),
  label: z.string().trim().min(1).max(160),
}).strict()

const ReportChartBlockSchema = z.object({
  kind: z.literal('chart'),
  id: LocalIdSchema,
  title: z.string().trim().min(2).max(160),
  datasetId: ReferenceIdSchema,
  template: z.enum(['kpi', 'bar', 'horizontal_bar', 'line', 'area', 'pie']),
  fieldIds: z.array(ReferenceIdSchema).max(4).default([]),
  metricIds: z.array(ReferenceIdSchema).min(1).max(6),
  filterIds: z.array(LocalIdSchema).max(12).default([]),
}).strict()

const ReportTableBlockSchema = z.object({
  kind: z.literal('table'),
  id: LocalIdSchema,
  title: z.string().trim().min(2).max(160),
  datasetId: ReferenceIdSchema,
  columnIds: z.array(ReferenceIdSchema).min(1).max(16),
  filterIds: z.array(LocalIdSchema).max(12).default([]),
  rowLimit: z.number().int().min(1).max(500).default(50),
}).strict()

const ReportNarrativeBlockSchema = z.object({
  kind: z.literal('narrative'),
  id: LocalIdSchema,
  title: z.string().trim().min(2).max(160),
  claims: z.array(z.object({
    text: z.string().trim().min(2).max(1_000),
    citationFactIds: z.array(LocalIdSchema).min(1).max(12),
  }).strict()).max(20).default([]),
}).strict()

export const ReportBlockSchema = z.discriminatedUnion('kind', [
  ReportChartBlockSchema,
  ReportTableBlockSchema,
  ReportNarrativeBlockSchema,
])

const ReportSectionSchema = z.object({
  id: LocalIdSchema,
  title: z.string().trim().min(2).max(160),
  purpose: z.string().trim().min(2).max(500),
  datasetIds: z.array(ReferenceIdSchema).min(1).max(8),
  blocks: z.array(ReportBlockSchema).min(1).max(20),
}).strict()

const ReportPageSchema = z.object({
  id: LocalIdSchema,
  title: z.string().trim().min(2).max(160),
  sectionIds: z.array(LocalIdSchema).min(1).max(8),
}).strict()

export const ReportSpecSchema = z.object({
  version: z.literal(REPORT_SPEC_VERSION).default(REPORT_SPEC_VERSION),
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(2).max(1_000),
  pages: z.array(ReportPageSchema).min(1).max(30),
  sections: z.array(ReportSectionSchema).min(1).max(100),
  filters: z.array(ReportFilterSchema).max(30).default([]),
  branding: z.object({
    organizationName: z.string().trim().min(1).max(160),
    primaryColor: HexColorSchema,
    accentColor: HexColorSchema,
    footerText: z.string().trim().max(240).default(''),
    showGeneratedAt: z.boolean().default(true),
  }).strict(),
  appendices: z.array(z.object({
    id: LocalIdSchema,
    title: z.string().trim().min(2).max(160),
    datasetIds: z.array(ReferenceIdSchema).min(1).max(20),
    includeMethodology: z.boolean().default(true),
    includeEvidenceTable: z.boolean().default(true),
  }).strict()).max(10).default([]),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().trim().min(2).max(500)).max(30).default([]),
}).strict()

export type ReportDatasetEvidence = z.infer<typeof ReportDatasetEvidenceSchema>
export type ReportFact = z.infer<typeof ReportFactSchema>
export type ReportSpec = z.infer<typeof ReportSpecSchema>

export interface ReportSpecValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string[]
}

function normalizedTokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2)
}

function relevance(dataset: ReportDatasetEvidence, tokens: string[]) {
  const searchable = [
    dataset.name,
    dataset.description ?? '',
    ...dataset.fields.map(field => field.name),
    ...dataset.metrics.map(metric => metric.name),
  ].join(' ').toLowerCase()
  return tokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0)
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => (
    items.slice(index * size, index * size + size)
  ))
}

export function buildDeterministicReportSpec({
  instruction,
  title,
  organizationName,
  datasets,
}: {
  instruction: string
  title: string
  organizationName: string
  datasets: ReportDatasetEvidence[]
}): ReportSpec {
  const governed = datasets
    .map(dataset => ReportDatasetEvidenceSchema.parse(dataset))
    .filter(dataset => dataset.fields.length + dataset.metrics.length > 0)
    .sort((left, right) => (
      relevance(right, normalizedTokens(instruction))
      - relevance(left, normalizedTokens(instruction))
    ))
    .slice(0, 8)
  if (governed.length === 0) {
    throw new Error('Report composition requires at least one governed published dataset.')
  }

  const sections = governed.map((dataset, index) => {
    const sectionId = `section_${index + 1}`
    const dateField = dataset.fields.find(field => field.role === 'date')
    const categoryField = dataset.fields.find(field => ['dimension', 'attribute'].includes(field.role))
    const chartFields = [dateField ?? categoryField].filter(Boolean).map(field => field!.id)
    const blocks: z.infer<typeof ReportBlockSchema>[] = []

    if (dataset.metrics.length > 0) {
      blocks.push({
        kind: 'chart',
        id: `chart_${index + 1}`,
        title: `${dataset.name} overview`,
        datasetId: dataset.id,
        template: dateField ? 'line' : categoryField ? 'bar' : 'kpi',
        fieldIds: chartFields,
        metricIds: dataset.metrics.slice(0, 4).map(metric => metric.id),
        filterIds: [],
      })
    }

    const columnIds = [
      ...dataset.fields.slice(0, 8).map(field => field.id),
      ...dataset.metrics.slice(0, 4).map(metric => metric.id),
    ].slice(0, 12)
    if (columnIds.length > 0) {
      blocks.push({
        kind: 'table',
        id: `table_${index + 1}`,
        title: `${dataset.name} detail`,
        datasetId: dataset.id,
        columnIds,
        filterIds: [],
        rowLimit: 50,
      })
    }

    return {
      id: sectionId,
      title: dataset.name,
      purpose: dataset.description || `Present governed analysis from ${dataset.name}.`,
      datasetIds: [dataset.id],
      blocks,
    }
  })
  const pages = chunks(sections, 3).map((pageSections, index) => ({
    id: `page_${index + 1}`,
    title: index === 0 ? title.trim() : `${title.trim()} — continued`,
    sectionIds: pageSections.map(section => section.id),
  }))

  return ReportSpecSchema.parse({
    title: title.trim(),
    summary: `Governed report outline for: ${instruction.trim()}`.slice(0, 1_000),
    pages,
    sections,
    filters: [],
    branding: {
      organizationName: organizationName.trim() || 'DashboardOS',
      primaryColor: '#172554',
      accentColor: '#2563eb',
      footerText: 'Generated from governed semantic datasets',
      showGeneratedAt: true,
    },
    appendices: [{
      id: 'appendix_methodology',
      title: 'Methodology and evidence',
      datasetIds: governed.map(dataset => dataset.id),
      includeMethodology: true,
      includeEvidenceTable: true,
    }],
    confidence: 0.82,
    warnings: ['Narrative claims remain empty until deterministic facts are computed and attached.'],
  })
}

export function validateReportSpec({
  spec,
  datasets,
  facts = [],
}: {
  spec: ReportSpec
  datasets: ReportDatasetEvidence[]
  facts?: ReportFact[]
}) {
  const candidate = ReportSpecSchema.parse(spec)
  const governedDatasets = new Map(
    datasets.map(dataset => {
      const parsed = ReportDatasetEvidenceSchema.parse(dataset)
      return [parsed.id, parsed] as const
    }),
  )
  const knownFacts = new Map(facts.map(fact => {
    const parsed = ReportFactSchema.parse(fact)
    return [parsed.id, parsed] as const
  }))
  const issues: ReportSpecValidationIssue[] = []
  const validFilters = candidate.filters.filter((filter, index) => {
    const dataset = governedDatasets.get(filter.datasetId)
    const valid = Boolean(dataset?.fields.some(field => field.id === filter.fieldId))
    if (!valid) {
      issues.push({
        severity: 'error',
        code: 'ungoverned_filter',
        message: 'Removed a filter that does not reference a governed dataset field.',
        path: ['filters', String(index)],
      })
    }
    return valid
  })
  const validFiltersById = new Map(validFilters.map(filter => [filter.id, filter] as const))

  const sections = candidate.sections.flatMap((section, sectionIndex) => {
    const datasetIds = [...new Set(section.datasetIds)].filter(datasetId => governedDatasets.has(datasetId))
    if (datasetIds.length === 0) {
      issues.push({
        severity: 'error',
        code: 'ungoverned_section',
        message: 'Removed a report section with no governed datasets.',
        path: ['sections', String(sectionIndex)],
      })
      return []
    }
    const sectionDatasetIds = new Set(datasetIds)
    const blocks = section.blocks.flatMap<z.infer<typeof ReportBlockSchema>>((block, blockIndex) => {
      const path = ['sections', String(sectionIndex), 'blocks', String(blockIndex)]
      if (block.kind === 'narrative') {
        const claims = block.claims.flatMap((claim, claimIndex) => {
          const citations = [...new Set(claim.citationFactIds)].filter(factId => {
            const fact = knownFacts.get(factId)
            return Boolean(fact && sectionDatasetIds.has(fact.datasetId))
          })
          if (citations.length === 0) {
            issues.push({
              severity: 'error',
              code: 'uncited_claim',
              message: 'Removed a narrative claim without governed computed-fact citations.',
              path: [...path, 'claims', String(claimIndex)],
            })
            return []
          }
          if (citations.length !== claim.citationFactIds.length) {
            issues.push({
              severity: 'warning',
              code: 'unknown_fact_citation',
              message: 'Removed citations that were not present in the governed evidence bundle.',
              path: [...path, 'claims', String(claimIndex), 'citationFactIds'],
            })
          }
          return [{ ...claim, citationFactIds: citations }]
        })
        return [{ ...block, claims }]
      }

      const dataset = governedDatasets.get(block.datasetId)
      if (!dataset || !sectionDatasetIds.has(block.datasetId)) {
        issues.push({
          severity: 'error',
          code: 'ungoverned_block_dataset',
          message: 'Removed a report block outside the section’s governed datasets.',
          path,
        })
        return []
      }
      const fieldIds = new Set(dataset.fields.map(field => field.id))
      const metricIds = new Set(dataset.metrics.map(metric => metric.id))
      const filterIds = block.filterIds.filter(
        filterId => validFiltersById.get(filterId)?.datasetId === block.datasetId,
      )
      if (block.kind === 'chart') {
        const validFields = [...new Set(block.fieldIds)].filter(fieldId => fieldIds.has(fieldId))
        const validMetrics = [...new Set(block.metricIds)].filter(metricId => metricIds.has(metricId))
        if (validMetrics.length === 0) {
          issues.push({
            severity: 'error',
            code: 'chart_without_governed_metric',
            message: 'Removed a chart without a governed metric.',
            path,
          })
          return []
        }
        if (
          validFields.length !== block.fieldIds.length
          || validMetrics.length !== block.metricIds.length
          || filterIds.length !== block.filterIds.length
        ) {
          issues.push({
            severity: 'warning',
            code: 'chart_references_sanitized',
            message: 'Removed chart references outside the governed dataset or filter set.',
            path,
          })
        }
        return [{ ...block, fieldIds: validFields, metricIds: validMetrics, filterIds }]
      }

      const columnIds = [...new Set(block.columnIds)].filter(
        columnId => fieldIds.has(columnId) || metricIds.has(columnId),
      )
      if (columnIds.length === 0) {
        issues.push({
          severity: 'error',
          code: 'table_without_governed_columns',
          message: 'Removed a table without governed fields or metrics.',
          path,
        })
        return []
      }
      if (columnIds.length !== block.columnIds.length || filterIds.length !== block.filterIds.length) {
        issues.push({
          severity: 'warning',
          code: 'table_references_sanitized',
          message: 'Removed table references outside the governed dataset or filter set.',
          path,
        })
      }
      return [{ ...block, columnIds, filterIds }]
    })
    if (blocks.length === 0) {
      issues.push({
        severity: 'error',
        code: 'empty_section',
        message: 'Removed a report section after all of its blocks failed governance checks.',
        path: ['sections', String(sectionIndex)],
      })
      return []
    }
    return [{ ...section, datasetIds, blocks }]
  })

  if (sections.length === 0) {
    throw new Error('No valid report sections remained after governance validation.')
  }
  const sectionIds = new Set(sections.map(section => section.id))
  const pages = candidate.pages.flatMap((page, index) => {
    const validSectionIds = [...new Set(page.sectionIds)].filter(sectionId => sectionIds.has(sectionId))
    if (validSectionIds.length === 0) {
      issues.push({
        severity: 'error',
        code: 'empty_page',
        message: 'Removed a page without governed report sections.',
        path: ['pages', String(index)],
      })
      return []
    }
    return [{ ...page, sectionIds: validSectionIds }]
  })
  const appendices = candidate.appendices.flatMap((appendix, index) => {
    const datasetIds = [...new Set(appendix.datasetIds)].filter(datasetId => governedDatasets.has(datasetId))
    if (datasetIds.length > 0) return [{ ...appendix, datasetIds }]
    issues.push({
      severity: 'warning',
      code: 'empty_appendix',
      message: 'Removed an appendix without governed datasets.',
      path: ['appendices', String(index)],
    })
    return []
  })

  const proposal = ReportSpecSchema.parse({
    ...candidate,
    pages,
    sections,
    filters: validFilters,
    appendices,
    confidence: Math.max(0, candidate.confidence - Math.min(0.4, issues.length * 0.03)),
    warnings: [
      ...candidate.warnings,
      ...issues.map(issue => issue.message),
    ].slice(0, 30),
  })

  return {
    proposal,
    issues,
    state: issues.some(issue => issue.severity === 'error')
      ? 'warning' as const
      : issues.length > 0
        ? 'warning' as const
        : 'valid' as const,
  }
}
