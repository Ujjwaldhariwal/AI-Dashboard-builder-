# Supabase Schema Boundaries

Last updated: 2026-06-25

This project is now an enterprise DB-to-dashboard platform. The database should no longer treat the older API-endpoint widget builder as a product foundation.

## Core Product Tables

These tables are the current foundation and should be protected:

- `tenants`
- `tenant_domains`
- `tenant_memberships`
- `dashboard_projects`
- `project_assignments`
- `data_sources`
- `data_source_columns`
- `business_models`
- `business_entities`
- `business_fields`
- `business_metrics`
- `business_relationships`
- `semantic_datasets`
- `dashboard_chart_configs`
- `dashboard_chart_validation_results`
- `published_dashboards`
- `dashboard_versions`
- `dashboard_pages`
- `dashboard_chart_slots`
- `dashboard_publish_events`
- `semantic_query_runs`
- `chart_health_runs`
- `dashboard_health_runs`
- `platform_alerts`
- `platform_alert_channels`
- `platform_alert_delivery_attempts`
- `query_budget_policies`
- `dashboard_export_artifacts`
- `audit_logs`

## Removed Legacy Tables

Migration `20260625184500_remove_legacy_builder_schema.sql` removes the old API-dashboard persistence layer:

- `dashboards`
- `endpoints`
- `widgets`
- `chart_groups`
- `chart_subgroups`
- `endpoint_profile_runs`
- `endpoint_profiles`
- `endpoint_mapping_feedback`
- `transform_blueprints`
- `api_endpoints`

Those tables belonged to the earlier user-owned builder flow. They mixed `user_id` ownership, endpoint profiling, and widget canvas state with the newer tenant/project semantic model.

## Remaining App Debt

Some UI and API code still references the removed legacy concepts through the local builder store and older routes. Treat that code as a legacy shell until it is replaced with tenant/project-scoped admin screens.

Do not add new Supabase dependencies on the removed tables. New work should use the core product tables above.

## Publishing Schema

Migration `20260625200000_dashboard_publishing.sql` adds first-class dashboard publishing instead of reviving the removed `dashboards`/`widgets` model:

- `published_dashboards`
- `dashboard_versions`
- `dashboard_pages`
- `dashboard_chart_slots`
- `dashboard_publish_events`

The publish model should reference `dashboard_chart_configs`, not legacy `widgets`.

Migration `20260625213000_dashboard_publishing_integrity.sql` hardens the publishing foundation with composite database constraints:

- Versions, pages, slots, publish events, and dashboard health runs must stay inside the same `tenant_id` and `project_id` as their parent dashboard.
- Chart slots can only reference chart configs from the same tenant/project scope.
- Published dashboard `current_version_id` must point to a version owned by that dashboard.
- New dashboard health rows must include tenant, project, and dashboard scope.

Migration `20260626183000_dashboard_export_artifacts.sql` adds durable export records for published dashboards:

- Export artifacts are scoped to tenant, project, dashboard, and optionally dashboard version.
- The initial supported artifact type is `manifest_json`, a portable dashboard metadata bundle without source credentials or raw query results.
- Export rows are readable by project/tenant access and insertable by project editors or trusted worker execution.

Migration `20260626203000_dashboard_export_storage_metadata.sql` adds object-storage metadata to export artifacts:

- Export artifacts now record storage bucket/path, storage status, byte size, and SHA-256 checksum.
- When `DASHBOARDOS_EXPORT_BUCKET` or `SUPABASE_EXPORT_BUCKET` is configured, worker-generated manifest JSON uploads to that Supabase Storage bucket.
- When no bucket is configured, the artifact remains inline in Postgres with checksum and byte-size metadata for local/demo use.

Migration `20260626193000_alert_delivery_channels.sql` adds external alert delivery state:

- `platform_alert_channels` stores tenant/project webhook and email-gateway channel configuration.
- `platform_alert_delivery_attempts` records delivery outcomes, response metadata, and errors per alert/channel/job.
- `platform_jobs` and `platform_job_schedules` now allow `alert_delivery` jobs with `alert` targets.

## Next Schema Work

The next foundation migrations should add delivery integrations around the new operational tables:

- external export object storage metadata for PDF/ZIP artifacts
