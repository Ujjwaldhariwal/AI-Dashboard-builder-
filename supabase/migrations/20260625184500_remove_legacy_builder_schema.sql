-- Retire the pre-enterprise API dashboard builder persistence model.
--
-- The product foundation now uses tenant/project-scoped data sources,
-- semantic models, semantic datasets, dashboard chart configs, query
-- telemetry, and chart health snapshots. These legacy tables were tied to
-- user-owned API endpoints/widgets and older training/profile flows, which
-- caused two competing dashboard schemas to exist at the same time.

drop table if exists endpoint_mapping_feedback cascade;
drop table if exists endpoint_profiles cascade;
drop table if exists endpoint_profile_runs cascade;
drop table if exists transform_blueprints cascade;
drop table if exists chart_subgroups cascade;
drop table if exists chart_groups cascade;
drop table if exists widgets cascade;
drop table if exists endpoints cascade;
drop table if exists dashboards cascade;
drop table if exists api_endpoints cascade;
