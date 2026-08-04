-- DashboardOS MDM demo source schema.
-- This schema is intentionally separate from public so the dummy source data is
-- not exposed through Supabase's Data API by default.

create schema if not exists mdm_demo;

revoke all on schema mdm_demo from public;
revoke all on schema mdm_demo from anon;
revoke all on schema mdm_demo from authenticated;

comment on schema mdm_demo is
  'Synthetic master-data-management source data for DashboardOS testing.';

create table if not exists mdm_demo.domains (
  domain_code text primary key,
  domain_name text not null unique,
  owner_team text not null,
  description text not null,
  criticality text not null
    check (criticality in ('standard', 'high', 'mission_critical')),
  created_at timestamptz not null default now()
);

create table if not exists mdm_demo.source_systems (
  source_code text primary key,
  source_name text not null unique,
  platform text not null,
  region text not null,
  trust_tier text not null
    check (trust_tier in ('authoritative', 'trusted', 'candidate')),
  created_at timestamptz not null default now()
);

create table if not exists mdm_demo.data_quality_snapshots (
  snapshot_date date not null,
  domain_code text not null
    references mdm_demo.domains(domain_code) on delete restrict,
  source_code text not null
    references mdm_demo.source_systems(source_code) on delete restrict,
  record_count bigint not null check (record_count >= 0),
  golden_record_count bigint not null check (golden_record_count >= 0),
  duplicate_record_count bigint not null check (duplicate_record_count >= 0),
  incomplete_record_count bigint not null check (incomplete_record_count >= 0),
  invalid_record_count bigint not null check (invalid_record_count >= 0),
  completeness_pct numeric(5,2) not null
    check (completeness_pct between 0 and 100),
  accuracy_pct numeric(5,2) not null
    check (accuracy_pct between 0 and 100),
  consistency_pct numeric(5,2) not null
    check (consistency_pct between 0 and 100),
  timeliness_pct numeric(5,2) not null
    check (timeliness_pct between 0 and 100),
  match_rate_pct numeric(5,2) not null
    check (match_rate_pct between 0 and 100),
  quality_score_pct numeric(5,2) not null
    check (quality_score_pct between 0 and 100),
  open_issue_count integer not null check (open_issue_count >= 0),
  critical_issue_count integer not null check (critical_issue_count >= 0),
  refreshed_at timestamptz not null default now(),
  primary key (snapshot_date, domain_code, source_code),
  check (golden_record_count <= record_count),
  check (duplicate_record_count <= record_count),
  check (incomplete_record_count <= record_count),
  check (invalid_record_count <= record_count),
  check (critical_issue_count <= open_issue_count)
);

create table if not exists mdm_demo.stewardship_issues (
  issue_id text primary key,
  domain_code text not null
    references mdm_demo.domains(domain_code) on delete restrict,
  source_code text not null
    references mdm_demo.source_systems(source_code) on delete restrict,
  issue_type text not null,
  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null
    check (status in ('new', 'triaged', 'in_progress', 'blocked', 'resolved')),
  steward_name text not null,
  affected_records integer not null check (affected_records >= 0),
  detected_at timestamptz not null,
  sla_due_at timestamptz not null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

create table if not exists mdm_demo.match_events (
  event_id bigint generated always as identity primary key,
  event_date date not null,
  domain_code text not null
    references mdm_demo.domains(domain_code) on delete restrict,
  source_code text not null
    references mdm_demo.source_systems(source_code) on delete restrict,
  candidate_pair_count integer not null check (candidate_pair_count >= 0),
  auto_merged_count integer not null check (auto_merged_count >= 0),
  steward_merged_count integer not null check (steward_merged_count >= 0),
  rejected_count integer not null check (rejected_count >= 0),
  confidence_band text not null
    check (confidence_band in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

create index if not exists idx_mdm_quality_snapshot_domain_date
  on mdm_demo.data_quality_snapshots (domain_code, snapshot_date desc);

create index if not exists idx_mdm_quality_snapshot_source_date
  on mdm_demo.data_quality_snapshots (source_code, snapshot_date desc);

create index if not exists idx_mdm_stewardship_status_severity
  on mdm_demo.stewardship_issues (status, severity, sla_due_at);

create index if not exists idx_mdm_stewardship_domain
  on mdm_demo.stewardship_issues (domain_code, detected_at desc);

create index if not exists idx_mdm_stewardship_source
  on mdm_demo.stewardship_issues (source_code);

create index if not exists idx_mdm_match_events_date_domain
  on mdm_demo.match_events (event_date desc, domain_code);

create index if not exists idx_mdm_match_events_domain
  on mdm_demo.match_events (domain_code);

create index if not exists idx_mdm_match_events_source
  on mdm_demo.match_events (source_code);

create or replace view mdm_demo.v_domain_quality_overview
with (security_invoker = true)
as
with latest as (
  select max(snapshot_date) as snapshot_date
  from mdm_demo.data_quality_snapshots
)
select
  snapshot.snapshot_date,
  domain.domain_code,
  domain.domain_name,
  domain.owner_team,
  domain.criticality,
  sum(snapshot.record_count)::bigint as total_records,
  sum(snapshot.golden_record_count)::bigint as golden_records,
  sum(snapshot.duplicate_record_count)::bigint as duplicate_records,
  sum(snapshot.incomplete_record_count)::bigint as incomplete_records,
  sum(snapshot.invalid_record_count)::bigint as invalid_records,
  round(
    100.0 * sum(snapshot.golden_record_count)
    / nullif(sum(snapshot.record_count), 0),
    2
  ) as golden_record_coverage_pct,
  round(
    100.0 * sum(snapshot.duplicate_record_count)
    / nullif(sum(snapshot.record_count), 0),
    2
  ) as duplicate_rate_pct,
  round(avg(snapshot.completeness_pct), 2) as completeness_pct,
  round(avg(snapshot.accuracy_pct), 2) as accuracy_pct,
  round(avg(snapshot.consistency_pct), 2) as consistency_pct,
  round(avg(snapshot.timeliness_pct), 2) as timeliness_pct,
  round(avg(snapshot.match_rate_pct), 2) as match_rate_pct,
  round(avg(snapshot.quality_score_pct), 2) as quality_score_pct,
  sum(snapshot.open_issue_count)::integer as open_issues,
  sum(snapshot.critical_issue_count)::integer as critical_issues
from mdm_demo.data_quality_snapshots snapshot
join latest on latest.snapshot_date = snapshot.snapshot_date
join mdm_demo.domains domain on domain.domain_code = snapshot.domain_code
group by
  snapshot.snapshot_date,
  domain.domain_code,
  domain.domain_name,
  domain.owner_team,
  domain.criticality;

create or replace view mdm_demo.v_source_quality_overview
with (security_invoker = true)
as
with latest as (
  select max(snapshot_date) as snapshot_date
  from mdm_demo.data_quality_snapshots
)
select
  snapshot.snapshot_date,
  source.source_code,
  source.source_name,
  source.platform,
  source.region,
  source.trust_tier,
  sum(snapshot.record_count)::bigint as total_records,
  round(avg(snapshot.quality_score_pct), 2) as quality_score_pct,
  round(avg(snapshot.match_rate_pct), 2) as match_rate_pct,
  round(
    100.0 * sum(snapshot.duplicate_record_count)
    / nullif(sum(snapshot.record_count), 0),
    2
  ) as duplicate_rate_pct,
  sum(snapshot.open_issue_count)::integer as open_issues,
  sum(snapshot.critical_issue_count)::integer as critical_issues
from mdm_demo.data_quality_snapshots snapshot
join latest on latest.snapshot_date = snapshot.snapshot_date
join mdm_demo.source_systems source on source.source_code = snapshot.source_code
group by
  snapshot.snapshot_date,
  source.source_code,
  source.source_name,
  source.platform,
  source.region,
  source.trust_tier;

create or replace view mdm_demo.v_quality_trend
with (security_invoker = true)
as
select
  snapshot.snapshot_date,
  domain.domain_code,
  domain.domain_name,
  sum(snapshot.record_count)::bigint as total_records,
  round(avg(snapshot.quality_score_pct), 2) as quality_score_pct,
  round(avg(snapshot.completeness_pct), 2) as completeness_pct,
  round(avg(snapshot.accuracy_pct), 2) as accuracy_pct,
  round(avg(snapshot.match_rate_pct), 2) as match_rate_pct,
  round(
    100.0 * sum(snapshot.duplicate_record_count)
    / nullif(sum(snapshot.record_count), 0),
    2
  ) as duplicate_rate_pct,
  sum(snapshot.open_issue_count)::integer as open_issues
from mdm_demo.data_quality_snapshots snapshot
join mdm_demo.domains domain on domain.domain_code = snapshot.domain_code
group by snapshot.snapshot_date, domain.domain_code, domain.domain_name;

create or replace view mdm_demo.v_stewardship_backlog
with (security_invoker = true)
as
select
  issue.issue_id,
  domain.domain_name,
  source.source_name,
  issue.issue_type,
  issue.severity,
  issue.status,
  issue.steward_name,
  issue.affected_records,
  issue.detected_at,
  issue.sla_due_at,
  greatest(
    0,
    floor(extract(epoch from (coalesce(issue.resolved_at, now()) - issue.detected_at)) / 86400)
  )::integer as age_days,
  issue.sla_due_at < now() and issue.status <> 'resolved' as is_sla_breached
from mdm_demo.stewardship_issues issue
join mdm_demo.domains domain on domain.domain_code = issue.domain_code
join mdm_demo.source_systems source on source.source_code = issue.source_code;

create or replace view mdm_demo.v_mdm_executive_kpis
with (security_invoker = true)
as
with latest as (
  select max(snapshot_date) as snapshot_date
  from mdm_demo.data_quality_snapshots
),
quality as (
  select snapshot.*
  from mdm_demo.data_quality_snapshots snapshot
  join latest on latest.snapshot_date = snapshot.snapshot_date
),
backlog as (
  select
    count(*) filter (where status <> 'resolved')::integer as open_issues,
    count(*) filter (
      where status <> 'resolved' and severity = 'critical'
    )::integer as critical_issues,
    count(*) filter (
      where status <> 'resolved' and sla_due_at < now()
    )::integer as breached_sla_issues
  from mdm_demo.stewardship_issues
)
select
  latest.snapshot_date,
  sum(quality.record_count)::bigint as total_master_records,
  sum(quality.golden_record_count)::bigint as golden_records,
  round(
    100.0 * sum(quality.golden_record_count)
    / nullif(sum(quality.record_count), 0),
    2
  ) as golden_record_coverage_pct,
  round(
    100.0 * sum(quality.duplicate_record_count)
    / nullif(sum(quality.record_count), 0),
    2
  ) as duplicate_rate_pct,
  round(avg(quality.quality_score_pct), 2) as quality_score_pct,
  round(avg(quality.match_rate_pct), 2) as match_rate_pct,
  backlog.open_issues,
  backlog.critical_issues,
  backlog.breached_sla_issues
from latest
cross join quality
cross join backlog
group by
  latest.snapshot_date,
  backlog.open_issues,
  backlog.critical_issues,
  backlog.breached_sla_issues;

comment on view mdm_demo.v_domain_quality_overview is
  'Latest MDM quality, coverage, duplicate, and issue metrics by domain.';

comment on view mdm_demo.v_source_quality_overview is
  'Latest MDM quality and issue metrics by contributing source system.';

comment on view mdm_demo.v_quality_trend is
  'Monthly MDM quality trend by domain for line and area charts.';

comment on view mdm_demo.v_stewardship_backlog is
  'Open and resolved stewardship work with SLA breach indicators.';

comment on view mdm_demo.v_mdm_executive_kpis is
  'Single-row executive KPI surface for the MDM dashboard.';
