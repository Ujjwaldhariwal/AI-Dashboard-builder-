-- Deterministic synthetic data for the DashboardOS MDM demo source.
-- Safe to run repeatedly: stable business keys are upserted and generated fact
-- ranges are replaced only inside the mdm_demo schema.

insert into mdm_demo.domains (
  domain_code,
  domain_name,
  owner_team,
  description,
  criticality
)
values
  (
    'CUSTOMER',
    'Customer',
    'Customer 360',
    'Golden customer identities, contacts, consent, and hierarchy.',
    'mission_critical'
  ),
  (
    'PRODUCT',
    'Product',
    'Product Information',
    'Product hierarchy, taxonomy, specifications, and lifecycle state.',
    'mission_critical'
  ),
  (
    'SUPPLIER',
    'Supplier',
    'Procurement Data',
    'Supplier identity, compliance, payment, and risk attributes.',
    'high'
  ),
  (
    'LOCATION',
    'Location',
    'Enterprise Operations',
    'Sites, plants, warehouses, service areas, and geographic hierarchy.',
    'high'
  ),
  (
    'MATERIAL',
    'Material',
    'Manufacturing Data',
    'Material master, units of measure, classifications, and plant extensions.',
    'standard'
  )
on conflict (domain_code) do update
set
  domain_name = excluded.domain_name,
  owner_team = excluded.owner_team,
  description = excluded.description,
  criticality = excluded.criticality;

insert into mdm_demo.source_systems (
  source_code,
  source_name,
  platform,
  region,
  trust_tier
)
values
  ('S4', 'SAP S/4HANA', 'ERP', 'Global', 'authoritative'),
  ('SFDC', 'Salesforce CRM', 'CRM', 'Americas', 'trusted'),
  ('COUPA', 'Coupa', 'Procurement', 'Global', 'trusted'),
  ('PLM', 'Teamcenter PLM', 'PLM', 'Europe', 'authoritative'),
  ('WMS', 'Blue Yonder WMS', 'WMS', 'APAC', 'trusted'),
  ('LEGACY', 'Legacy MDM Hub', 'Custom', 'Global', 'candidate')
on conflict (source_code) do update
set
  source_name = excluded.source_name,
  platform = excluded.platform,
  region = excluded.region,
  trust_tier = excluded.trust_tier;

delete from mdm_demo.data_quality_snapshots
where snapshot_date between date '2025-08-01' and date '2026-07-01';

with
months as (
  select
    generated.snapshot_date::date,
    (row_number() over (order by generated.snapshot_date) - 1)::integer as month_index
  from generate_series(
    date '2025-08-01',
    date '2026-07-01',
    interval '1 month'
  ) as generated(snapshot_date)
),
domain_seed as (
  select *
  from (
    values
      ('CUSTOMER'::text, 1),
      ('PRODUCT'::text, 2),
      ('SUPPLIER'::text, 3),
      ('LOCATION'::text, 4),
      ('MATERIAL'::text, 5)
  ) as seed(domain_code, domain_index)
),
source_seed as (
  select *
  from (
    values
      ('S4'::text, 1, 0.0::numeric),
      ('SFDC'::text, 2, 1.1::numeric),
      ('COUPA'::text, 3, 1.7::numeric),
      ('PLM'::text, 4, 0.7::numeric),
      ('WMS'::text, 5, 1.4::numeric),
      ('LEGACY'::text, 6, 3.4::numeric)
  ) as seed(source_code, source_index, quality_penalty)
),
base as (
  select
    months.snapshot_date,
    months.month_index,
    domain_seed.domain_code,
    domain_seed.domain_index,
    source_seed.source_code,
    source_seed.source_index,
    source_seed.quality_penalty,
    (
      18000
      + domain_seed.domain_index * 11500
      + source_seed.source_index * 3800
      + months.month_index * 420
    )::bigint as record_count,
    greatest(
      82.0,
      least(
        99.2,
        88.2
        + months.month_index * 0.58
        - domain_seed.domain_index * 0.25
        - source_seed.quality_penalty
      )
    )::numeric as quality_score
  from months
  cross join domain_seed
  cross join source_seed
)
insert into mdm_demo.data_quality_snapshots (
  snapshot_date,
  domain_code,
  source_code,
  record_count,
  golden_record_count,
  duplicate_record_count,
  incomplete_record_count,
  invalid_record_count,
  completeness_pct,
  accuracy_pct,
  consistency_pct,
  timeliness_pct,
  match_rate_pct,
  quality_score_pct,
  open_issue_count,
  critical_issue_count
)
select
  snapshot_date,
  domain_code,
  source_code,
  record_count,
  round(
    record_count
    * least(0.985, 0.82 + month_index * 0.010 - quality_penalty * 0.006)
  )::bigint as golden_record_count,
  round(
    record_count
    * greatest(0.008, 0.061 - month_index * 0.0034 + quality_penalty * 0.004)
  )::bigint as duplicate_record_count,
  round(
    record_count
    * greatest(0.006, 0.048 - month_index * 0.0027 + quality_penalty * 0.003)
  )::bigint as incomplete_record_count,
  round(
    record_count
    * greatest(0.004, 0.034 - month_index * 0.0018 + quality_penalty * 0.002)
  )::bigint as invalid_record_count,
  round(least(99.4, quality_score + 1.6), 2) as completeness_pct,
  round(least(99.1, quality_score + 0.5), 2) as accuracy_pct,
  round(greatest(80.0, quality_score - 0.8), 2) as consistency_pct,
  round(greatest(78.0, quality_score - 1.4), 2) as timeliness_pct,
  round(
    least(99.0, quality_score + 0.9 - quality_penalty * 0.2),
    2
  ) as match_rate_pct,
  round(quality_score, 2) as quality_score_pct,
  greatest(
    2,
    28 - month_index * 2 + domain_index + source_index
  )::integer as open_issue_count,
  greatest(
    0,
    5 - floor(month_index / 3.0)::integer
    + case when source_code = 'LEGACY' then 2 else 0 end
    - case when domain_code = 'LOCATION' then 1 else 0 end
  )::integer as critical_issue_count
from base;

delete from mdm_demo.stewardship_issues
where issue_id like 'MDM-%';

insert into mdm_demo.stewardship_issues (
  issue_id,
  domain_code,
  source_code,
  issue_type,
  severity,
  status,
  steward_name,
  affected_records,
  detected_at,
  sla_due_at,
  resolved_at,
  resolution_note
)
values
  (
    'MDM-1001',
    'CUSTOMER',
    'SFDC',
    'Duplicate identity cluster',
    'critical',
    'in_progress',
    'Aisha Rao',
    1842,
    '2026-07-15T04:30:00Z',
    '2026-07-17T04:30:00Z',
    null,
    null
  ),
  (
    'MDM-1002',
    'PRODUCT',
    'PLM',
    'Missing regulatory classification',
    'high',
    'triaged',
    'Vikram Shah',
    716,
    '2026-07-18T08:15:00Z',
    '2026-07-22T08:15:00Z',
    null,
    null
  ),
  (
    'MDM-1003',
    'SUPPLIER',
    'COUPA',
    'Invalid tax identifier',
    'critical',
    'blocked',
    'Neha Kapoor',
    129,
    '2026-07-20T06:00:00Z',
    '2026-07-21T06:00:00Z',
    null,
    null
  ),
  (
    'MDM-1004',
    'LOCATION',
    'WMS',
    'Geocode precision below threshold',
    'medium',
    'new',
    'Rohan Mehta',
    488,
    '2026-07-23T03:20:00Z',
    '2026-07-30T03:20:00Z',
    null,
    null
  ),
  (
    'MDM-1005',
    'MATERIAL',
    'S4',
    'Unit-of-measure conflict',
    'high',
    'in_progress',
    'Sara Thomas',
    935,
    '2026-07-21T10:45:00Z',
    '2026-07-25T10:45:00Z',
    null,
    null
  ),
  (
    'MDM-1006',
    'CUSTOMER',
    'LEGACY',
    'Consent status not synchronized',
    'critical',
    'new',
    'Aisha Rao',
    2640,
    '2026-07-25T09:00:00Z',
    '2026-07-27T09:00:00Z',
    null,
    null
  ),
  (
    'MDM-1007',
    'PRODUCT',
    'S4',
    'Orphan product hierarchy node',
    'medium',
    'triaged',
    'Vikram Shah',
    304,
    '2026-07-24T05:40:00Z',
    '2026-07-31T05:40:00Z',
    null,
    null
  ),
  (
    'MDM-1008',
    'SUPPLIER',
    'LEGACY',
    'Bank detail completeness',
    'high',
    'blocked',
    'Neha Kapoor',
    221,
    '2026-07-17T07:30:00Z',
    '2026-07-22T07:30:00Z',
    null,
    null
  ),
  (
    'MDM-1009',
    'LOCATION',
    'S4',
    'Timezone mapping inconsistency',
    'low',
    'resolved',
    'Rohan Mehta',
    78,
    '2026-07-10T03:10:00Z',
    '2026-07-17T03:10:00Z',
    '2026-07-14T11:00:00Z',
    'Mapped locations to the governed timezone reference set.'
  ),
  (
    'MDM-1010',
    'MATERIAL',
    'PLM',
    'Material description language gap',
    'medium',
    'resolved',
    'Sara Thomas',
    512,
    '2026-07-08T02:00:00Z',
    '2026-07-15T02:00:00Z',
    '2026-07-13T06:30:00Z',
    'Backfilled English descriptions from the approved translation service.'
  ),
  (
    'MDM-1011',
    'CUSTOMER',
    'S4',
    'Household hierarchy conflict',
    'high',
    'in_progress',
    'Aisha Rao',
    413,
    '2026-07-26T04:45:00Z',
    '2026-07-29T04:45:00Z',
    null,
    null
  ),
  (
    'MDM-1012',
    'PRODUCT',
    'LEGACY',
    'Retired SKU still active',
    'high',
    'new',
    'Vikram Shah',
    187,
    '2026-07-27T07:00:00Z',
    '2026-07-30T07:00:00Z',
    null,
    null
  );

truncate table mdm_demo.match_events restart identity;

with
event_days as (
  select generated.event_date::date
  from generate_series(
    date '2026-06-01',
    date '2026-07-28',
    interval '1 day'
  ) as generated(event_date)
),
domain_seed as (
  select *
  from (
    values
      ('CUSTOMER'::text, 1),
      ('PRODUCT'::text, 2),
      ('SUPPLIER'::text, 3),
      ('LOCATION'::text, 4),
      ('MATERIAL'::text, 5)
  ) as seed(domain_code, domain_index)
),
source_seed as (
  select *
  from (
    values
      ('S4'::text, 1),
      ('SFDC'::text, 2),
      ('COUPA'::text, 3),
      ('PLM'::text, 4),
      ('WMS'::text, 5),
      ('LEGACY'::text, 6)
  ) as seed(source_code, source_index)
)
insert into mdm_demo.match_events (
  event_date,
  domain_code,
  source_code,
  candidate_pair_count,
  auto_merged_count,
  steward_merged_count,
  rejected_count,
  confidence_band
)
select
  event_days.event_date,
  domain_seed.domain_code,
  source_seed.source_code,
  (
    80
    + domain_seed.domain_index * 17
    + source_seed.source_index * 11
    + extract(day from event_days.event_date)::integer
  )::integer as candidate_pair_count,
  (
    52
    + domain_seed.domain_index * 10
    + source_seed.source_index * 7
    + extract(day from event_days.event_date)::integer
  )::integer as auto_merged_count,
  (
    8
    + domain_seed.domain_index * 2
    + source_seed.source_index
  )::integer as steward_merged_count,
  (
    4
    + ((domain_seed.domain_index + source_seed.source_index) % 6)
  )::integer as rejected_count,
  case
    when source_seed.source_code in ('S4', 'PLM') then 'high'
    when source_seed.source_code = 'LEGACY' then 'low'
    else 'medium'
  end as confidence_band
from event_days
cross join domain_seed
cross join source_seed;
