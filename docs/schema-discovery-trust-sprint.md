# Sprint 1A — trustworthy schema discovery and table selection

## Outcome

An engineer connecting a database can immediately answer:

- How many database objects were fetched?
- Which schemas, tables, views, and columns were found?
- Why was each object recommended, excluded, or left for review?
- Which tables will be available to the semantic layer?

The product must show the complete discovered inventory without treating every visible database object as business data.

## Delivery model

- Length: 10 working days.
- Workstreams: database/backend, discovery policy, frontend, semantic governance, and QA/security.
- Release strategy: feature flag per tenant/project, with existing data sources migrated to a compatibility state.
- Exit evidence: migrations, API contracts, deterministic tests, audit events, and an approved electricity-database demo.

## Problem statement

The current Postgres introspector scans every visible `BASE TABLE` and `VIEW` in the selected schema allowlist. It groups column metadata by `schema.table` and persists those raw counts on the data source. The UI then presents those counts as “tables / columns,” even when some objects are views, framework tables, audit tables, or unrelated application tables.

For the electricity demo, downstream automation knows to use only `electricity_readings` and `electricity_customers`, but that selection is not represented as a governed product concept. A user can therefore see `11 tables / 72 columns` while expecting two business tables.

## Design principles

1. **Discovery is factual.** Preserve every relation returned by the scoped metadata query.
2. **Selection is intentional.** Only user-confirmed relations may enter semantic modeling.
3. **Classification is explainable.** Deterministic rules provide reason codes; AI is not required to decide access.
4. **Counts have names.** Never label views as tables or project totals as source totals.
5. **Rescans are stable.** Unchanged selections survive; new and changed relations require review.
6. **Governance is enforced server-side.** UI hiding alone must not control semantic access.

## Target workflow

1. Connect and test a read-only Postgres data source.
2. Select one or more schemas to inspect.
3. Introspect all visible relations and columns in those schemas.
4. Show an inventory summary such as:

   > 11 objects discovered: 7 tables and 4 views, containing 72 columns.
   > 2 tables selected for analytics, 6 excluded, and 3 awaiting review.

5. Let the user inspect exact relation names, types, column counts, key evidence, and recommendation reasons.
6. Require the user to confirm the analytics scope.
7. Expose only confirmed relations and columns to semantic-model proposals, datasets, and chart generation.
8. On schema refresh, preserve unchanged decisions and surface a review diff.

## State model

Keep the raw inventory separate from user decisions.

### `data_source_relations`

One current row per discovered relation:

- `id`
- `tenant_id`, `project_id`, `data_source_id`
- `schema_name`, `relation_name`
- `relation_type`: `table`, `partitioned_table`, `view`, `materialized_view`, or `foreign_table`
- `column_count`
- `estimated_row_count`
- `comment`
- `fingerprint`
- `first_discovered_at`, `last_discovered_at`
- unique identity on `(data_source_id, schema_name, relation_name)`

`data_source_columns` remains the raw column inventory and should reference the relation identity after migration.

### `data_source_relation_selections`

One governed decision per discovered relation:

- `tenant_id`, `project_id`, `data_source_id`, `relation_id`
- `status`: `included`, `excluded`, or `review`
- `decision_source`: `system_rule`, `user`, or `compatibility_migration`
- `reason_code`
- optional `reason_note`
- `decided_by`, `decided_at`, `updated_at`
- `inventory_fingerprint` used when the decision was made

Selections must use tenant/project-consistent foreign keys and project-editor RLS. Changes produce audit events.

### Count contract

Return named counts instead of one ambiguous total:

- `discoveredObjectCount`
- `discoveredTableCount`
- `discoveredViewCount`
- `discoveredColumnCount`
- `includedObjectCount`
- `includedColumnCount`
- `excludedObjectCount`
- `reviewObjectCount`

Required invariant:

`discoveredObjectCount = includedObjectCount + excludedObjectCount + reviewObjectCount`

## Deterministic classification policy

Classification proposes a decision but does not silently discard inventory.

### Exclude by policy

- PostgreSQL system schemas when they are ever requested.
- Explicit tenant/project denylist entries.
- Known migration/history relations such as `_prisma_migrations`, `knex_migrations`, and `flyway_schema_history`.
- Objects the source role cannot read.

### Recommend for inclusion

- Base or partitioned tables in an allowed schema.
- Tables with meaningful columns beyond migration bookkeeping.
- Tables with primary-key, foreign-key, date, category, or measurable numeric evidence.

### Require review

- Views and materialized views.
- Foreign tables.
- Empty or keyless tables.
- Names matching audit, log, history, staging, temporary, backup, or archive patterns.
- New relations found after a previously confirmed inventory.
- Relations whose fingerprint changed in a way that invalidates the prior decision.

Every proposed decision must include a stable reason code and a short user-facing explanation. AI may later improve descriptions, but it cannot silently include a relation.

## Backend work

### Introspection

- Return relation-level metadata separately from column metadata.
- Preserve the actual Postgres relation type instead of collapsing everything to `BASE TABLE` or `VIEW` labels.
- Calculate discovered counts from the current complete snapshot.
- Apply classification only after raw discovery is complete.
- Persist inventory, classifications, and counts atomically.
- Record added, removed, changed, and unchanged relations for refresh diffs.

### APIs

Add:

- `GET /api/admin/data-sources/{id}/schema-inventory`
  - returns named counts, relation rows, reason codes, selection status, and refresh diff.
- `PUT /api/admin/data-sources/{id}/schema-selection`
  - accepts the full confirmed selection with an inventory fingerprint for optimistic concurrency.

Update:

- `POST /api/admin/data-sources/{id}/introspect`
  - returns `inventorySummary` and `reviewRequired`; retain old count fields temporarily for compatibility.
- `GET /api/admin/schema-columns`
  - require an explicit `scope=selected|all`; semantic consumers use `selected`.

All write routes require project-editor access. All reads remain tenant/project scoped.

### Semantic enforcement

- Block business-field creation when its source relation is not `included`.
- Filter Semantic Copilot evidence to included relations only.
- Reject dataset compilation when a referenced relation is excluded, awaiting review, removed, or changed since approval.
- Add publish-readiness blockers for stale or unconfirmed relation selections.

## Frontend work

Replace the ambiguous source badge with:

> 11 objects · 7 tables · 4 views · 72 columns

Add a source-scoped inventory drawer or page with:

- Search by schema, relation, or column.
- Tabs or filters for Included, Review, Excluded, Tables, and Views.
- Exact relation name and type.
- Column count, estimated row count, keys, and relationship evidence.
- Recommendation status and plain-language reason.
- Bulk include/exclude plus individual overrides.
- A confirmation action showing the final semantic scope.

The project-level summary must be explicitly labeled “Across N data sources.” It must not reuse a source-level label.

The default view emphasizes selected business tables. The complete raw inventory remains available under “All discovered objects.”

## Refresh behavior

- Same relation and same fingerprint: preserve its decision.
- Same relation with a changed fingerprint: preserve inventory history and move the relation to `review` when the change affects selected columns or keys.
- New relation: add as `review`, unless a deterministic exclusion rule applies.
- Removed relation: mark it unavailable, invalidate dependent semantic artifacts, and show impacted fields/datasets.
- A refresh never silently expands the semantic scope.

## Compatibility and rollout

- Existing data sources begin with discovered relations marked `included` through `compatibility_migration` so current dashboards do not break.
- Their UI shows “Scope review recommended.”
- New data sources require confirmation before semantic-model creation.
- Gate server-side enforcement and the new UI behind the same tenant/project rollout policy.
- After adoption, change `/schema-columns` semantic call sites from implicit all-relations access to `scope=selected`.
- Remove legacy ambiguous count fields only after all consumers use the named count contract.

## Ten-day execution plan

### Days 1–2 — contracts and migration

- Finalize relation types, selection states, reason codes, and count invariants.
- Add relation and selection tables, indexes, tenant/project constraints, RLS, and audit actions.
- Build a reproducible fixture containing two business tables plus nine support tables/views and 72 total columns.

### Days 3–4 — discovery engine

- Refactor Postgres metadata extraction into relation and column inventories.
- Implement deterministic classification and atomic snapshot persistence.
- Implement refresh diffing and selection preservation.

### Days 5–6 — APIs and governance

- Add inventory and selection endpoints.
- Add explicit selected/all scope to schema-column reads.
- Enforce selected relations in semantic fields, proposal evidence, dataset compilation, and publish readiness.

### Days 7–8 — user experience

- Add the inventory summary, exact object list, filters, reasons, and confirmation flow.
- Correct source-level versus project-level counts.
- Add new-object and changed-object review states.

### Days 9–10 — hardening and rollout

- Complete unit, integration, RLS, refresh-diff, and end-to-end tests.
- Run the electricity demo and a multi-schema fixture.
- Verify compatibility migration and rollback behavior.
- Document operations, feature-flag rollout, and support diagnostics.

## Acceptance criteria

1. With a fixture containing two business tables plus nine support objects, the UI reports all 11 discovered objects and lists every exact name.
2. The same fixture clearly shows only the two confirmed business tables as available to semantic modeling.
3. Table and view counts are separate and add up to the discovered object count.
4. The displayed column count matches the visible inventory and can be reconciled per relation.
5. A user can include or exclude a relation and see the selected column count update immediately.
6. Semantic fields and datasets cannot reference a relation that is excluded or awaiting review.
7. Rescanning an unchanged schema preserves all decisions.
8. A newly discovered relation does not enter semantic scope without confirmation.
9. Removing or materially changing an included relation identifies impacted semantic artifacts and blocks unsafe publishing.
10. Project totals are labeled as aggregates and cannot be mistaken for a single source's inventory.
11. All inventory and selection APIs pass tenant-isolation and project-role tests.
12. Audit logs identify who changed the analytics scope, what changed, and which inventory fingerprint was confirmed.

## Required tests

- Unit: relation grouping, relation-type mapping, classification reason codes, count arithmetic, and refresh diffing.
- Integration: atomic inventory persistence, selection concurrency, RLS, audit events, and compatibility migration.
- API: source-scoped inventory, selection validation, explicit column scope, and stale fingerprint conflict.
- Semantic: excluded/review relation rejection and selected-relation success.
- End-to-end: connect the 11-object fixture, inspect all names, select two tables, create a semantic model, preview a dataset, refresh, and verify scope stability.
- Regression: existing published dashboards continue to run after compatibility migration.

## Out of scope

- Additional database engines.
- AI-only table selection.
- Automatic inclusion based on sampled values.
- Destructive changes to the source database.
- Redesigning datasets, charts, or publishing beyond the new selection enforcement.

## Definition of done

- Users can reconcile every discovered count with an exact database object and its columns.
- Raw discovery and approved analytics scope are persisted as separate governed concepts.
- Only confirmed relations reach semantic modeling and downstream dashboard creation.
- The electricity demo clearly communicates “11 discovered, 2 selected” instead of implying that all 11 objects are business tables.
- Tests, RLS, auditability, refresh stability, feature-flag rollout, and compatibility evidence are complete.
