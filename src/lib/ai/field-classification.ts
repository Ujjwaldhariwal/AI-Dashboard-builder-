import type { BusinessFieldRole } from '@/types/semantic-model'

export type AiFieldClassification =
  | 'safe_for_ai'
  | 'aggregated_only'
  | 'pii_blocked'
  | 'admin_only'

export interface AiFieldClassificationResult {
  classification: AiFieldClassification
  reason: string
}

const PII_PATTERNS = [
  /(^|[_\s-])(customer|full|first|last)?_?name($|[_\s-])/i,
  /email|e[-_\s]?mail/i,
  /phone|mobile|contact|telephone/i,
  /address|street|postcode|zipcode|zip_code|postal/i,
  /account(_|\s|-)?(number|no|id)?|acct/i,
  /iban|ssn|aadhaar|pan(_|\s|-)?number|passport|license/i,
  /card(_|\s|-)?(number|no)|credit(_|\s|-)?card/i,
]

const ADMIN_PATTERNS = [
  /password|secret|token|credential|ciphertext|private(_|\s|-)?key|api(_|\s|-)?key/i,
]

const AGGREGATED_PATTERNS = [
  /amount|revenue|cost|price|salary|balance|payment|bill|invoice|usage|consumption|kwh|load|kw|hours|score|count|total|qty|quantity/i,
]

const SAFE_PATTERNS = [
  /city|region|state|country|status|type|category|segment|month|date|day|year|created_at|updated_at/i,
]

function textForField(field: Record<string, unknown>) {
  const sourceColumn = field.source_column && typeof field.source_column === 'object'
    ? field.source_column as Record<string, unknown>
    : {}
  return [
    field.name,
    field.semantic_key,
    field.role,
    field.display_format,
    sourceColumn.columnName,
    sourceColumn.tableName,
    sourceColumn.dataType,
  ].map(value => String(value ?? '')).join(' ')
}

export function classifyFieldForAi(field: Record<string, unknown>): AiFieldClassificationResult {
  const text = textForField(field)
  const role = String(field.role ?? '') as BusinessFieldRole

  if (ADMIN_PATTERNS.some(pattern => pattern.test(text))) {
    return { classification: 'admin_only', reason: 'credential_or_secret_pattern' }
  }

  if (PII_PATTERNS.some(pattern => pattern.test(text))) {
    return { classification: 'pii_blocked', reason: 'sensitive_identifier_pattern' }
  }

  if (role === 'identifier' || role === 'hidden') {
    return { classification: 'aggregated_only', reason: `semantic_role_${role}` }
  }

  if (role === 'metric_source' || AGGREGATED_PATTERNS.some(pattern => pattern.test(text))) {
    return { classification: 'aggregated_only', reason: 'numeric_or_financial_measure' }
  }

  if (role === 'date' || role === 'dimension' || SAFE_PATTERNS.some(pattern => pattern.test(text))) {
    return { classification: 'safe_for_ai', reason: 'low_sensitivity_dimension' }
  }

  return { classification: 'aggregated_only', reason: 'unknown_field_default' }
}

export function isFieldAllowedForAiPreview(field: Record<string, unknown>) {
  return classifyFieldForAi(field).classification === 'safe_for_ai'
}

export function isMetricAllowedForAi(metric: Record<string, unknown>, sourceField?: Record<string, unknown>) {
  if (!sourceField) return false
  const classification = classifyFieldForAi(sourceField).classification
  return classification === 'safe_for_ai' || classification === 'aggregated_only'
}

export function sanitizedFieldDescriptor(field: Record<string, unknown>) {
  const sourceColumn = field.source_column && typeof field.source_column === 'object'
    ? field.source_column as Record<string, unknown>
    : {}
  const classification = classifyFieldForAi(field)
  return {
    id: String(field.id ?? ''),
    label: String(field.name ?? field.semantic_key ?? ''),
    semanticKey: String(field.semantic_key ?? ''),
    role: String(field.role ?? ''),
    dataType: String(sourceColumn.dataType ?? ''),
    classification: classification.classification,
    reason: classification.reason,
    allowedInPreview: classification.classification === 'safe_for_ai',
  }
}

export function sanitizedMetricDescriptor(metric: Record<string, unknown>, sourceField?: Record<string, unknown>) {
  const sourceClassification = sourceField
    ? classifyFieldForAi(sourceField)
    : { classification: 'pii_blocked' as const, reason: 'missing_source_field' }
  return {
    id: String(metric.id ?? ''),
    label: String(metric.name ?? metric.semantic_key ?? ''),
    semanticKey: String(metric.semantic_key ?? ''),
    aggregation: String(metric.aggregation ?? ''),
    unit: typeof metric.unit === 'string' ? metric.unit : null,
    displayFormat: typeof metric.display_format === 'string' ? metric.display_format : null,
    classification: sourceClassification.classification === 'pii_blocked' || sourceClassification.classification === 'admin_only'
      ? sourceClassification.classification
      : 'aggregated_only' as const,
    reason: sourceClassification.reason,
    allowedInPreview: sourceClassification.classification === 'safe_for_ai' || sourceClassification.classification === 'aggregated_only',
  }
}
