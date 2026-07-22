import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  AI_WORKFLOW_CONTRACT_VERSION,
  AiWorkflowProposalEnvelopeSchema,
  AiWorkflowRequestSchema,
} from '../src/lib/ai/workflow-contracts'
import {
  buildAiWorkflowInputFingerprint,
  mapAiWorkflowRun,
} from '../src/lib/ai/workflow-runs'
import { resolveAiWorkflowModelSelection } from '../src/lib/ai/workflow-provider'
import { classifyAiWorkflowFallback } from '../src/lib/ai/workflow-fallback'

const tenantId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'

test.describe('governed AI workflow foundation', () => {
  test('parses strict, versioned workflow requests', () => {
    const request = AiWorkflowRequestSchema.parse({
      tenantId,
      projectId,
      workflowType: 'semantic_mapping',
      instruction: 'Create a billing semantic model.',
      context: { dataSourceId: '33333333-3333-4333-8333-333333333333' },
    })

    expect(request.contractVersion).toBe(AI_WORKFLOW_CONTRACT_VERSION)
    expect(AiWorkflowRequestSchema.safeParse({ ...request, sql: 'select * from secrets' }).success).toBe(false)
  })

  test('creates deterministic fingerprints without persisting raw instructions', () => {
    const request = AiWorkflowRequestSchema.parse({
      tenantId,
      projectId,
      workflowType: 'report_generation',
      instruction: 'Create a confidential board report for the north region.',
      context: {
        datasetId: '44444444-4444-4444-8444-444444444444',
        nested: { period: 'Q2' },
      },
    })
    const first = buildAiWorkflowInputFingerprint(request)
    const second = buildAiWorkflowInputFingerprint({
      ...request,
      context: {
        nested: { period: 'Q2' },
        datasetId: '44444444-4444-4444-8444-444444444444',
      },
    })

    expect(first.inputHash).toBe(second.inputHash)
    expect(first.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(first.inputSummary)).not.toContain(request.instruction)
    expect(first.inputSummary).toMatchObject({
      instructionCharacters: request.instruction.length,
      references: { datasetId: '44444444-4444-4444-8444-444444444444' },
    })
  })

  test('validates proposal confidence and blocks unknown executable fields', () => {
    const valid = AiWorkflowProposalEnvelopeSchema.parse({
      workflowType: 'dashboard_composition',
      artifactType: 'dashboard',
      confidence: 0.82,
      proposal: { title: 'Executive overview' },
    })

    expect(valid.requiresReview).toBe(true)
    expect(AiWorkflowProposalEnvelopeSchema.safeParse({
      ...valid,
      confidence: 1.5,
    }).success).toBe(false)
    expect(AiWorkflowProposalEnvelopeSchema.safeParse({
      ...valid,
      executableSql: 'drop table customers',
    }).success).toBe(false)
  })

  test('resolves provider policy with workflow overrides before global defaults', () => {
    expect(resolveAiWorkflowModelSelection({
      workflowType: 'semantic_mapping',
      env: {},
    })).toMatchObject({
      providerId: 'google',
      modelId: 'gemini-2.5-flash',
      source: 'default',
    })

    expect(resolveAiWorkflowModelSelection({
      workflowType: 'report_generation',
      env: {
        AI_PROVIDER: 'openai',
        AI_MODEL: 'global-model',
        AI_REPORT_PROVIDER: 'openai-compatible',
        AI_REPORT_MODEL: 'local-report-model',
        AI_COMPATIBLE_BASE_URL: 'http://localhost:11434/v1',
      },
    })).toMatchObject({
      providerId: 'openai_compatible',
      modelId: 'local-report-model',
      source: 'workflow_override',
      compatibleBaseUrl: 'http://localhost:11434/v1',
    })
  })

  test('rejects incomplete local provider configuration', () => {
    expect(() => resolveAiWorkflowModelSelection({
      workflowType: 'data_transform',
      env: {
        AI_PROVIDER: 'openai_compatible',
        AI_MODEL: 'local-model',
      },
    })).toThrow('AI_COMPATIBLE_BASE_URL')
  })

  test('distinguishes missing workflow storage from an AI provider outage', () => {
    expect(classifyAiWorkflowFallback(new Error('relation "ai_workflow_runs" does not exist'))).toMatchObject({
      reason: 'setup_required',
      migrations: [
        '20260716090000_ai_workflow_foundation.sql',
        '20260722090000_dataset_planning_workflow.sql',
      ],
    })
    expect(classifyAiWorkflowFallback(new Error('Missing Google AI key.'))).toMatchObject({
      reason: 'provider_configuration',
      migrations: [],
    })
    expect(classifyAiWorkflowFallback(new Error('429 quota exceeded'))).toMatchObject({
      reason: 'provider_unavailable',
      migrations: [],
    })
  })

  test('maps persisted run rows without exposing untracked columns', () => {
    const mapped = mapAiWorkflowRun({
      id: 'run-1',
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: 'user-1',
      workflow_type: 'semantic_mapping',
      status: 'running',
      provider_id: 'google',
      model_id: 'model-1',
      prompt_version: 'semantic.v1',
      contract_version: AI_WORKFLOW_CONTRACT_VERSION,
      input_hash: 'abc',
      input_summary: { contextKeys: ['schemaHash'] },
      output_summary: {},
      validation_summary: {},
      usage: {},
      latency_ms: null,
      error_code: null,
      error_message: null,
      started_at: '2026-07-16T00:00:00.000Z',
      completed_at: null,
      created_at: '2026-07-16T00:00:00.000Z',
      updated_at: '2026-07-16T00:00:00.000Z',
      raw_prompt: 'must not be mapped',
    })

    expect(mapped.inputSummary).toEqual({ contextKeys: ['schemaHash'] })
    expect(JSON.stringify(mapped)).not.toContain('must not be mapped')
  })

  test('migration enforces scoped RLS, audit events, and no authenticated deletes', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260716090000_ai_workflow_foundation.sql'),
      'utf8',
    )

    expect(migration).toContain('create table if not exists ai_workflow_runs')
    expect(migration).toContain('create table if not exists ai_workflow_proposals')
    expect(migration).toContain('foreign key (run_id, tenant_id, project_id)')
    expect(migration).toContain('alter table ai_workflow_runs enable row level security')
    expect(migration).toContain('can_publish_project(project_id)')
    expect(migration).toContain("audit_action := 'ai.workflow.started'")
    expect(migration).toContain("audit_action := 'ai.workflow.proposal_created'")
    expect(migration).not.toMatch(/grant\s+delete\s+on\s+ai_workflow_(runs|proposals)\s+to\s+authenticated/i)
    expect(migration).not.toMatch(/grant\s+.*\s+on\s+ai_workflow_(runs|proposals)\s+to\s+anon/i)
  })
})
