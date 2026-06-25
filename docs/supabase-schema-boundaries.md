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
- `semantic_query_runs`
- `chart_health_runs`
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

## Next Schema Work

The next foundation migration should add first-class dashboard publishing instead of reviving the removed `dashboards`/`widgets` model. Recommended tables:

- `published_dashboards`
- `dashboard_versions`
- `dashboard_pages`
- `dashboard_chart_slots`
- `dashboard_publish_events`

The publish model should reference `dashboard_chart_configs`, not legacy `widgets`.
