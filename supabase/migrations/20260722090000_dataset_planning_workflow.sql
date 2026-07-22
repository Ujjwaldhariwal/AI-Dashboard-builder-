alter table ai_workflow_runs
  drop constraint if exists ai_workflow_runs_workflow_type_check;

alter table ai_workflow_runs
  add constraint ai_workflow_runs_workflow_type_check
  check (workflow_type in (
    'semantic_mapping',
    'dataset_planning',
    'dashboard_composition',
    'report_generation',
    'chart_refinement',
    'data_transform'
  ));

comment on constraint ai_workflow_runs_workflow_type_check on ai_workflow_runs is
  'Supported governed AI workflows, including reviewable dataset planning.';
