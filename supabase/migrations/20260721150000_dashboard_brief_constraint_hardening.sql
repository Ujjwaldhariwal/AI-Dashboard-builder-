-- Keep the original dashboard brief migration immutable while tightening its
-- database-level contract for installations that may already have applied it.
alter table dashboards
drop constraint if exists dashboards_dashboard_brief_shape_check;

alter table dashboards
add constraint dashboards_dashboard_brief_shape_check
check (
  dashboard_brief is null
  or (
    jsonb_typeof(dashboard_brief) = 'object'
    and dashboard_brief ->> 'version' = '1'
    and jsonb_typeof(dashboard_brief -> 'id') = 'string'
    and jsonb_typeof(dashboard_brief -> 'title') = 'string'
    and jsonb_typeof(dashboard_brief -> 'objective') = 'string'
    and dashboard_brief ? 'requirements'
    and jsonb_typeof(dashboard_brief -> 'requirements') = 'array'
    and jsonb_array_length(dashboard_brief -> 'requirements') between 1 and 24
  )
);
