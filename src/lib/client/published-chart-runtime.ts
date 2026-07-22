export interface PublishedChartFieldResolutionInput {
  fieldNames: string[]
  rows: Record<string, unknown>[]
  requestedXField?: string
  requestedYFields?: string[]
  requestedTooltipFields?: string[]
  requestedSortField?: string
}

export interface PublishedChartFieldResolution {
  xField: string
  yFields: string[]
  tooltipFields: string[]
  sortField: string
}

function comparableFieldName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

function resolveAvailableField(fieldNames: string[], requested?: string) {
  const candidate = requested?.trim()
  if (!candidate) return ''
  if (fieldNames.includes(candidate)) return candidate

  const normalized = comparableFieldName(candidate)
  return fieldNames.find(field => comparableFieldName(field) === normalized) ?? ''
}

function isNumericValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || !value.trim()) return false
  return Number.isFinite(Number(value.replace(/,/g, '').trim()))
}

function isNumericField(rows: Record<string, unknown>[], fieldName: string) {
  const populatedValues = rows
    .map(row => row[fieldName])
    .filter(value => value !== null && value !== undefined && value !== '')
  return populatedValues.length > 0 && populatedValues.some(isNumericValue)
}

function uniqueFields(fields: string[]) {
  return Array.from(new Set(fields.filter(Boolean)))
}

export function resolvePublishedChartFields({
  fieldNames,
  rows,
  requestedXField,
  requestedYFields = [],
  requestedTooltipFields = [],
  requestedSortField,
}: PublishedChartFieldResolutionInput): PublishedChartFieldResolution {
  const availableFields = uniqueFields([
    ...fieldNames,
    ...Object.keys(rows[0] ?? {}),
  ])
  const requestedX = resolveAvailableField(availableFields, requestedXField)
  const firstDimension = availableFields.find(field => !isNumericField(rows, field))
  const xField = requestedX || firstDimension || availableFields[0] || ''

  const resolvedRequestedMetrics = uniqueFields(requestedYFields
    .map(field => resolveAvailableField(availableFields, field)))
  const inferredMetrics = availableFields.filter(field => (
    field !== xField && isNumericField(rows, field)
  ))
  const yFields = resolvedRequestedMetrics.length > 0
    ? resolvedRequestedMetrics
    : inferredMetrics

  return {
    xField,
    yFields,
    tooltipFields: uniqueFields(requestedTooltipFields
      .map(field => resolveAvailableField(availableFields, field))),
    sortField: resolveAvailableField(availableFields, requestedSortField),
  }
}
