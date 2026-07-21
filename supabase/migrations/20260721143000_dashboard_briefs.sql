alter table dashboards
add column if not exists dashboard_brief jsonb;

comment on column dashboards.dashboard_brief is
'Versioned engineer-authored requirements used to generate editable dashboard drafts.';

alter table dashboards
drop constraint if exists dashboards_dashboard_brief_shape_check;

alter table dashboards
add constraint dashboards_dashboard_brief_shape_check
check (
  dashboard_brief is null
  or (
    jsonb_typeof(dashboard_brief) = 'object'
    and dashboard_brief ? 'version'
    and dashboard_brief ? 'id'
    and dashboard_brief ? 'title'
    and dashboard_brief ? 'objective'
    and jsonb_typeof(dashboard_brief -> 'requirements') = 'array'
    and jsonb_array_length(dashboard_brief -> 'requirements') between 1 and 24
  )
);

