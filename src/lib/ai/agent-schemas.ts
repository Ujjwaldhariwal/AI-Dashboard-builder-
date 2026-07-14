import { z } from 'zod'

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
export const TransformAggregateReducerSchema = z.enum(['sum', 'avg', 'min', 'max', 'count'])
export const TransformDateFormatSchema = z.enum([
  'iso-date',
  'iso-datetime',
  'locale-date',
  'locale-datetime',
  'month-day',
  'month-short',
  'year-month',
])

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
  z.object({
    type: z.literal('fields_to_rows'),
    fields: z.array(z.string()),
    keyField: z.string(),
    valueField: z.string(),
    keyLabels: z.record(z.string(), z.string()).optional(),
    keepOtherFields: z.boolean().optional(),
  }).strict(),
  z.object({
    type: z.literal('group_aggregate'),
    groupBy: z.array(z.string()),
    valueField: z.string(),
    reducer: TransformAggregateReducerSchema,
    outputField: z.string(),
  }).strict(),
  z.object({
    type: z.literal('map_values'),
    field: z.string(),
    mappings: z.record(z.string(), z.string()),
    defaultValue: z.string().optional(),
  }).strict(),
  z.object({
    type: z.literal('date_format'),
    field: z.string(),
    outputField: z.string(),
    format: TransformDateFormatSchema,
  }).strict(),
])

export const ReportInsightSchema = z.object({
  executiveSummary: z
    .string()
    .describe("A high-level summary of the entire dashboard's data."),
  anomalies: z
    .array(z.string())
    .describe('Any concerning trends, spikes, or drops in the data.'),
  widgetInsights: z
    .record(z.string(), z.string())
    .describe('Key: Widget ID. Value: A 1-2 sentence analytical insight about that specific chart.'),
})

export type ReportInsight = z.infer<typeof ReportInsightSchema>
