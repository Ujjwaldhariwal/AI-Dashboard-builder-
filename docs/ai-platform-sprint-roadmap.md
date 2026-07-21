# DashboardOS governed AI platform roadmap

## Product outcome

DashboardOS will provide one governed AI platform with three product workflows:

1. **Semantic Copilot** proposes business entities, fields, metrics, relationships, and datasets from profiled database schemas.
2. **Dashboard Copilot** turns natural-language requirements into validated charts, interactions, and responsive canvas layouts.
3. **Report Composer** turns natural-language requirements and approved datasets into branded, fully structured PDF reports.

The model is a planner. DashboardOS remains the executor, validator, policy engine, audit system, and publisher. No AI output may bypass tenant/project access, deterministic validation, preview, or required human approval.

## Delivery model

- Sprint length: 10 working days.
- Workstreams: AI/backend, data/semantic, frontend/design, security/platform, and QA/evaluation.
- Release strategy: tenant/project rollout policies with preview-only defaults.
- Completion evidence: tests, audit events, evaluation results, and an approved demo scenario.

## Delivery status

- Sprint 0: completed and verified on 2026-07-16; database migration is prepared but not automatically deployed.
- Sprint 1: completed and verified on 2026-07-16; schema intelligence migration is prepared but not automatically deployed.
- Sprint 1A: prepared as the next foundation sprint; see `docs/schema-discovery-trust-sprint.md`.
- Sprint 2: prepared and follows Sprint 1A.

## Sprint 0 — shared governed AI foundation

**Goal:** establish one execution contract and audit trail for every current and future AI workflow.

### AI/backend

- Add versioned workflow request, validation, usage, and proposal-envelope schemas.
- Add a provider registry for Google, OpenAI, and OpenAI-compatible local endpoints.
- Add pure provider-policy resolution with workflow-specific overrides.
- Add run/proposal persistence helpers that never store a raw prompt in summary metadata.

### Security/platform

- Add tenant/project-scoped `ai_workflow_runs` and `ai_workflow_proposals` tables.
- Enforce RLS, project-editor writes, project-access reads, and tenant/project consistency.
- Generate audit events for run and proposal lifecycle changes.
- Record provider, model, prompt version, contract version, fingerprint, latency, usage, validation, and errors.

### QA/evaluation

- Test strict contracts, deterministic fingerprints, provider override precedence, row mapping, and migration guardrails.
- Confirm raw instructions are absent from persisted input summaries.

### Definition of done

- The shared foundation compiles and passes tests.
- Hosted and OpenAI-compatible providers can be selected without changing workflow code.
- Every proposal is linked to a tenant/project-scoped run and requires a review status.

## Sprint 1 — schema intelligence and safe profiling

**Goal:** give Semantic Copilot reliable evidence beyond names and data types.

### Data/semantic

- Introspect primary keys, foreign keys, unique constraints, indexes, and database comments.
- Collect bounded profiles: row estimate, null ratio, distinct estimate, min/max, date range, and safe value patterns.
- Generate masked samples with PII and credential detection before any model context is built.
- Score join candidates using constraints, name similarity, value overlap, and observed cardinality.
- Store profiles by data-source schema hash so unchanged schemas reuse evidence.

### Frontend

- Add schema-scope selection and profiling status to the data-source experience.
- Display evidence and confidence for relationship candidates.

### Definition of done

- The electricity demo identifies both public tables, their join key, field roles, and cardinality without exposing sensitive values.

## Sprint 1A — trustworthy schema discovery and table selection

**Goal:** make every discovered schema count explainable while separating raw database inventory from the user-approved analytics scope.

This sprint adds relation-level inventory, explicit table/view counts, deterministic recommendations, user-confirmed inclusion/exclusion, refresh diffs, and server-side enforcement so unrelated database objects cannot silently enter semantic modeling.

The complete architecture, execution plan, and acceptance criteria are in [`schema-discovery-trust-sprint.md`](schema-discovery-trust-sprint.md).

## Sprint 2 — Semantic Copilot

**Goal:** create reviewable semantic models and dataset recipes from schema evidence and requirements.

### AI/backend

- Define `SemanticModelProposal.v1` with entities, fields, metrics, relationships, dataset recipes, confidence, and rationale.
- Add tenant glossary and approved-mapping context retrieval.
- Generate proposals using the shared workflow foundation.
- Validate references, aggregations, relationship paths, and sensitive-field policies.
- Compile candidate datasets with the existing query compiler and run bounded previews.
- Detect row multiplication and unexpected total changes before review.

### Frontend

- Add side-by-side proposal/evidence review, edit, approve, and reject flows.
- Materialize only approved proposals through the existing guided semantic model store.

### Definition of done

- A user requirement can produce a safe one-table or multi-table dataset proposal, and no proposal can publish without approval.

## Sprint 3 — Dashboard and Chart Copilot

**Goal:** construct and refine complete governed dashboards from natural language.

### AI/backend

- Introduce `DashboardPlan.v1` and `ChartDesignSpec.v2`.
- Extend the current chart patch with axes, series, tooltips, filters, interactions, presentation tokens, and grid placement.
- Resolve all model references against approved semantic datasets.
- Add canvas collision, chart grammar, query budget, accessibility, and sensitive-field validators.

### Frontend/design

- Add a dashboard requirement bar and streaming plan progress.
- Render a preview diff before applying chart or layout changes.
- Support conversational refinements such as resizing, moving, recoloring, filtering, and changing chart type.

### Definition of done

- A natural-language requirement creates a validated draft dashboard with multiple charts and a responsive layout without arbitrary code generation.

## Sprint 4 — custom Report Composer

**Goal:** generate grounded, branded PDF reports from user requirements.

### AI/backend

- Introduce `ReportSpec.v1` for pages, sections, datasets, filters, charts, tables, narrative, branding, and appendices.
- Resolve requirements only against approved semantic datasets.
- Compute KPIs, comparisons, trends, and anomaly evidence deterministically.
- Require generated narrative to cite computed fact IDs.
- Version report drafts and support requirement refinements.

### Frontend/design

- Add a report requirement bar, outline preview, section editor, theme controls, and final PDF preview.
- Expand the existing React PDF renderer with reusable branded components.

### Definition of done

- A user can request a multi-page branded report, review its outline and evidence, and download a deterministic PDF whose claims trace to governed query results.

## Sprint 5 — learning, evaluation, and production hardening

**Goal:** improve quality safely and prepare controlled production rollout.

### AI/data

- Store tenant-isolated approved edits, rejections, and validator outcomes as feedback.
- Retrieve similar approved mappings and designs before generating new proposals.
- Add golden evaluation sets for semantic joins, charts, reports, privacy, and tenant isolation.
- Compare model/provider quality, latency, structured-output success, and cost.

### Security/platform

- Add provider/data-residency policies, retention controls, cancellation, retry budgets, and operational dashboards.
- Red-team prompt injection through schema comments, sample values, and user requirements.
- Add production rollout gates and rollback procedures.

### Definition of done

- Production rollout is backed by measurable quality thresholds, privacy tests, cost controls, and per-tenant enablement.

## Decisions held until evidence exists

- Do not train or fine-tune a model during the first five sprints.
- Do not add LangGraph while the current Supabase state and platform job system provide sufficient durability.
- Do not allow models to emit executable SQL, JavaScript, CSS, or unrestricted ECharts options.
- Consider fine-tuning only after approved feedback is representative and retrieval plus prompting no longer meets measured targets.
