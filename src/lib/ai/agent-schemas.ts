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

