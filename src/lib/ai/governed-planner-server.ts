import { generateObject } from 'ai'

import {
  DatasetCopilotProposalSchema,
  validateDatasetCopilotProposal,
  type DatasetFieldEvidence,
  type DatasetMetricEvidence,
  type DatasetRelationshipEvidence,
} from '@/lib/ai/dataset-copilot'
import {
  selectSemanticContextColumns,
  SemanticCopilotProposalSchema,
  validateSemanticCopilotProposal,
} from '@/lib/ai/semantic-copilot'
import { getAiWorkflowModel, type AiWorkflowModel } from '@/lib/ai/workflow-provider'
import type { DataSourceColumnMetadata } from '@/types/data-source'

export const SEMANTIC_COPILOT_PROMPT_VERSION = 'semantic-copilot.v1'
export const DATASET_COPILOT_PROMPT_VERSION = 'dataset-copilot.v1'

export async function generateSemanticMappingProposal({
  columns,
  instruction,
  modelName,
  modelVersion,
  ai = getAiWorkflowModel({ workflowType: 'semantic_mapping' }),
}: {
  columns: DataSourceColumnMetadata[]
  instruction: string
  modelName: string
  modelVersion?: number
  ai?: AiWorkflowModel
}) {
  const evidence = selectSemanticContextColumns(columns).map(column => ({
    columnId: column.id,
    source: `${column.schemaName}.${column.tableName}.${column.columnName}`,
    dataType: column.dataType,
    nullable: column.isNullable,
  }))
  const result = await generateObject({
    model: ai.model,
    schema: SemanticCopilotProposalSchema,
    system: `You are DashboardOS Semantic Copilot. Convert approved database schema evidence into a reviewable business semantic proposal.

Rules:
- Reference only columnId values supplied in APPROVED SCHEMA EVIDENCE.
- Propose clear business entity and field names without assuming a specific industry.
- Classify identifiers, dimensions, dates, measures, attributes, and sensitive or technical fields conservatively.
- Only attach metric definitions to metric_source mappings.
- Propose joins only when both source column IDs exist and the relationship is plausible.
- Never output SQL, executable expressions, sample values, credentials, or extra keys.
- Confidence is 0 to 1. Low-confidence choices still require a concise reason.`,
    prompt: `BUSINESS OBJECTIVE
${instruction}

MODEL
${modelName}${modelVersion ? ` v${modelVersion}` : ''}

APPROVED SCHEMA EVIDENCE
${JSON.stringify(evidence)}

Create the semantic proposal.`,
  })
  const checked = validateSemanticCopilotProposal({ proposal: result.object, selectedColumns: columns })
  return { ...checked, providerId: ai.providerId, modelId: ai.modelId, usage: result.usage }
}

export async function generateDatasetPlanningProposal({
  instruction,
  modelName,
  modelVersion,
  fields,
  metrics,
  relationships,
  requiredFieldIds = [],
  requiredMetricIds = [],
  ai = getAiWorkflowModel({ workflowType: 'dataset_planning' }),
}: {
  instruction: string
  modelName: string
  modelVersion?: number
  fields: DatasetFieldEvidence[]
  metrics: DatasetMetricEvidence[]
  relationships: DatasetRelationshipEvidence[]
  requiredFieldIds?: string[]
  requiredMetricIds?: string[]
  ai?: AiWorkflowModel
}) {
  const result = await generateObject({
    model: ai.model,
    schema: DatasetCopilotProposalSchema,
    system: `You are DashboardOS Dataset Copilot. Select a compact, useful dataset from an approved semantic model.
Reference only supplied IDs. Prefer business dimensions and dates over technical identifiers. Include only metrics relevant to the objective. Include approved relationships needed to connect selected entities. Include every required field and metric ID. Never emit SQL or invent fields.`,
    prompt: `BUSINESS OBJECTIVE
${instruction}

APPROVED SEMANTIC MODEL
${modelName}${modelVersion ? ` v${modelVersion}` : ''}

REQUIRED FIELD IDS
${JSON.stringify(requiredFieldIds)}

REQUIRED METRIC IDS
${JSON.stringify(requiredMetricIds)}

FIELDS
${JSON.stringify(fields)}

METRICS
${JSON.stringify(metrics)}

RELATIONSHIPS
${JSON.stringify(relationships)}`,
  })
  const checked = validateDatasetCopilotProposal({ proposal: result.object, fields, metrics, relationships })
  return { ...checked, providerId: ai.providerId, modelId: ai.modelId, usage: result.usage }
}
