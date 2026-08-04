# Supabase migration reconciliation

Last reconciled: 2026-07-29
Linked project: `ai-dashboard-builder` (`fmhwxggejoerbpawejro`)

## Current state

Run:

```bash
npm run db:migrations:check
```

The guard compares local migration filenames with the linked project's migration ledger and fails closed when either side has unmatched versions.

Current result:

- 58 local and remote versions are aligned.
- All 12 previously remote-only migrations were fetched into `supabase/migrations`.
- All 42 previously local-only versions were catalog-audited before their ledger entries were repaired.
- The five live guided-publish database acceptance tests pass against the reconciled project.
- `supabase db push` was not used.

Fetched remote migrations:

- `20260630091819 repair_dashboard_runtime_schema`
- `20260630092020 repair_dashboard_ops_and_entitlements`
- `20260630092102 repair_transform_blueprints`
- `20260706071507 repair_dashboard_chart_schema_contract`
- `20260707060615 repair_ops_health_and_alert_schema_contract`
- `20260707065754 repair_runtime_query_schema_contract`
- `20260724064840 schema_intelligence_profiles`
- `20260724064920 harden_trigger_function_execution`
- `20260724080133 optimize_ai_workflow_foreign_keys`
- `20260724080247 optimize_ai_workflow_rls_initplan`
- `20260727074337 provision_default_tenant_capabilities`
- `20260727095529 ai_chart_refinement_rollout_policies`

## Safety rule

Do not run `supabase db push`, mark migrations as applied, or delete remote migration-history rows while the guard fails. Migration history is not proof of schema equivalence.

## Completed reconciliation

1. Fetched the 12 remote-only migration files without changing the database.
2. Compared every local-only migration's declared tables, columns, functions, indexes, and triggers with the linked database catalog.
3. Confirmed that 32 versions were represented by the remote repair chain.
4. Identified ten partially represented versions. Their missing contract was limited to operational columns, supporting indexes, queue-claim functions, and the legacy schema-snapshot compatibility RPC.
5. Applied `20260729100914_reconcile_remote_schema_contract.sql` as an additive forward migration. It backfilled the seven existing job rows from legacy columns and did not replace the stricter remote RLS policies.
6. Verified all 60 formerly missing catalog objects and reran the five live database tests successfully.
7. Marked the 42 verified historical versions as applied with `supabase migration repair`.
8. Confirmed `npm run db:migrations:check` reports 58 aligned versions.

If drift returns, repeat the object-level comparison and add forward DDL before repairing history. Never use history repair to conceal missing schema.
