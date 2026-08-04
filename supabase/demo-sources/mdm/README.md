# MDM demo source

This pack creates synthetic master-data-management data for DashboardOS in the
dedicated demo source Supabase project. It does not modify the DashboardOS
application schema.

Current test target:

- Supabase project: `Demo Client Postgres Supabase`
- Project reference: `aurhetpowyyqpranfrrt`
- DashboardOS data source: `DEMO MDM`
- DashboardOS tenant: `demo-mdm-dashboard`
- DashboardOS project: `Dashboard Workspace`

Apply the files in order:

1. `001_schema.sql` creates the isolated `mdm_demo` schema, tables, indexes,
   and dashboard-ready views.
2. `002_seed.sql` loads deterministic data and can be run repeatedly.
3. `003_validation.sql` verifies expected row counts and KPI outputs.

The schema is intentionally not exposed through the Supabase Data API. Connect
DashboardOS to the project's Postgres endpoint and include `mdm_demo` in the
selected schema scope.

Recommended dashboard surfaces:

- Executive KPI cards from `v_mdm_executive_kpis`
- Domain quality and golden-record coverage from `v_domain_quality_overview`
- Source-system duplicate rate from `v_source_quality_overview`
- Twelve-month quality trend from `v_quality_trend`
- Stewardship SLA queue from `v_stewardship_backlog`
- Match and merge activity from `match_events`

Expected seed totals:

- 5 governed domains
- 6 source systems
- 360 monthly quality snapshots
- 12 stewardship issues
- 1,740 match events

After applying or refreshing the source, run schema introspection for the
`DEMO MDM` data source and explicitly include the `mdm_demo` schema in the
governed table selection before running project autopilot.
