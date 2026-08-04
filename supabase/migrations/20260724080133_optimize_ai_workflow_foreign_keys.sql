-- Keep foreign-key checks and cascade operations index-backed as workflow history grows.
create index if not exists idx_ai_workflow_runs_actor_user_id
on public.ai_workflow_runs (actor_user_id);

create index if not exists idx_ai_workflow_runs_project_id
on public.ai_workflow_runs (project_id);

create index if not exists idx_ai_workflow_proposals_project_id
on public.ai_workflow_proposals (project_id);

create index if not exists idx_ai_workflow_proposals_reviewed_by
on public.ai_workflow_proposals (reviewed_by);

create index if not exists idx_ai_workflow_proposals_scoped_run
on public.ai_workflow_proposals (run_id, tenant_id, project_id);;
