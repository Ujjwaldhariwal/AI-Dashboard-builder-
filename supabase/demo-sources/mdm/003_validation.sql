select
  (select count(*) from mdm_demo.domains) as domains,
  (select count(*) from mdm_demo.source_systems) as source_systems,
  (select count(*) from mdm_demo.data_quality_snapshots) as quality_snapshots,
  (select count(*) from mdm_demo.stewardship_issues) as stewardship_issues,
  (select count(*) from mdm_demo.match_events) as match_events,
  (
    select count(*)
    from mdm_demo.v_domain_quality_overview
  ) as domain_overview_rows,
  (
    select count(*)
    from mdm_demo.v_source_quality_overview
  ) as source_overview_rows,
  (
    select count(*)
    from mdm_demo.v_quality_trend
  ) as quality_trend_rows,
  (
    select count(*)
    from mdm_demo.v_mdm_executive_kpis
  ) as executive_kpi_rows;

select *
from mdm_demo.v_mdm_executive_kpis;

select
  domain_name,
  quality_score_pct,
  golden_record_coverage_pct,
  duplicate_rate_pct,
  open_issues,
  critical_issues
from mdm_demo.v_domain_quality_overview
order by quality_score_pct asc;
