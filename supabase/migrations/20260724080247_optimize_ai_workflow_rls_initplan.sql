-- Evaluate the request user once per statement instead of once per candidate row.
alter policy "ai workflow runs creatable by project editors"
on public.ai_workflow_runs
with check (
  actor_user_id = (select auth.uid())
  and can_publish_project(project_id)
  and exists (
    select 1
    from public.dashboard_projects dp
    where dp.id = ai_workflow_runs.project_id
      and dp.tenant_id = ai_workflow_runs.tenant_id
  )
);;
