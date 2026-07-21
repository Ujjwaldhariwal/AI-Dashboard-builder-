create table if not exists ai_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  workflow_type text not null check (workflow_type in (
    'semantic_mapping',
    'dashboard_composition',
    'report_generation',
    'chart_refinement',
    'data_transform'
  )),
  status text not null default 'queued' check (status in (
    'queued',
    'running',
    'awaiting_review',
    'succeeded',
    'failed',
    'cancelled'
  )),
  provider_id text not null check (provider_id in ('google', 'openai', 'openai_compatible')),
  model_id text not null,
  prompt_version text not null,
  contract_version text not null,
  input_hash text not null,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, project_id)
);

create table if not exists ai_workflow_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('semantic_model', 'dataset', 'dashboard', 'chart', 'report')),
  status text not null default 'proposed' check (status in (
    'proposed',
    'validated',
    'needs_review',
    'approved',
    'rejected',
    'applied'
  )),
  contract_version text not null,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  proposal jsonb not null,
  validation jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_workflow_proposals_scoped_run_fk
    foreign key (run_id, tenant_id, project_id)
    references ai_workflow_runs(id, tenant_id, project_id)
    on delete cascade
);

create index if not exists idx_ai_workflow_runs_project_created
on ai_workflow_runs (tenant_id, project_id, created_at desc);

create index if not exists idx_ai_workflow_runs_type_status
on ai_workflow_runs (workflow_type, status, created_at desc);

create index if not exists idx_ai_workflow_runs_input_hash
on ai_workflow_runs (tenant_id, project_id, workflow_type, input_hash, created_at desc);

create index if not exists idx_ai_workflow_proposals_run
on ai_workflow_proposals (run_id, created_at desc);

create index if not exists idx_ai_workflow_proposals_review
on ai_workflow_proposals (tenant_id, project_id, status, created_at desc);

alter table ai_workflow_runs enable row level security;
alter table ai_workflow_proposals enable row level security;

grant select, insert, update on ai_workflow_runs to authenticated;
grant select, insert, update on ai_workflow_proposals to authenticated;
grant all on ai_workflow_runs to service_role;
grant all on ai_workflow_proposals to service_role;

drop policy if exists "ai workflow runs readable by project access" on ai_workflow_runs;
drop policy if exists "ai workflow runs creatable by project editors" on ai_workflow_runs;
drop policy if exists "ai workflow runs mutable by project editors" on ai_workflow_runs;
drop policy if exists "ai workflow proposals readable by project access" on ai_workflow_proposals;
drop policy if exists "ai workflow proposals creatable by project editors" on ai_workflow_proposals;
drop policy if exists "ai workflow proposals mutable by project editors" on ai_workflow_proposals;

create policy "ai workflow runs readable by project access"
on ai_workflow_runs for select
to authenticated
using (
  has_project_access(project_id)
  and exists (
    select 1
    from dashboard_projects dp
    where dp.id = ai_workflow_runs.project_id
      and dp.tenant_id = ai_workflow_runs.tenant_id
  )
);

create policy "ai workflow runs creatable by project editors"
on ai_workflow_runs for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and can_publish_project(project_id)
  and exists (
    select 1
    from dashboard_projects dp
    where dp.id = ai_workflow_runs.project_id
      and dp.tenant_id = ai_workflow_runs.tenant_id
  )
);

create policy "ai workflow runs mutable by project editors"
on ai_workflow_runs for update
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and exists (
    select 1
    from dashboard_projects dp
    where dp.id = ai_workflow_runs.project_id
      and dp.tenant_id = ai_workflow_runs.tenant_id
  )
);

create policy "ai workflow proposals readable by project access"
on ai_workflow_proposals for select
to authenticated
using (
  has_project_access(project_id)
  and exists (
    select 1
    from dashboard_projects dp
    where dp.id = ai_workflow_proposals.project_id
      and dp.tenant_id = ai_workflow_proposals.tenant_id
  )
);

create policy "ai workflow proposals creatable by project editors"
on ai_workflow_proposals for insert
to authenticated
with check (
  can_publish_project(project_id)
  and exists (
    select 1
    from ai_workflow_runs run
    where run.id = ai_workflow_proposals.run_id
      and run.tenant_id = ai_workflow_proposals.tenant_id
      and run.project_id = ai_workflow_proposals.project_id
  )
);

create policy "ai workflow proposals mutable by project editors"
on ai_workflow_proposals for update
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and exists (
    select 1
    from ai_workflow_runs run
    where run.id = ai_workflow_proposals.run_id
      and run.tenant_id = ai_workflow_proposals.tenant_id
      and run.project_id = ai_workflow_proposals.project_id
  )
);

create or replace function set_ai_workflow_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ai_workflow_runs_set_updated_at on ai_workflow_runs;
create trigger ai_workflow_runs_set_updated_at
before update on ai_workflow_runs
for each row execute function set_ai_workflow_updated_at();

drop trigger if exists ai_workflow_proposals_set_updated_at on ai_workflow_proposals;
create trigger ai_workflow_proposals_set_updated_at
before update on ai_workflow_proposals
for each row execute function set_ai_workflow_updated_at();

create or replace function audit_ai_workflow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_action text;
  audit_target_type text;
  audit_actor uuid;
  audit_metadata jsonb;
begin
  if tg_table_name = 'ai_workflow_runs' then
    if tg_op = 'INSERT' then
      audit_action := 'ai.workflow.started';
    elsif old.status is distinct from new.status then
      audit_action := 'ai.workflow.status_changed';
    else
      return new;
    end if;
    audit_target_type := 'ai_workflow_run';
    audit_actor := coalesce(new.actor_user_id, auth.uid());
    audit_metadata := jsonb_build_object(
      'workflowType', new.workflow_type,
      'status', new.status,
      'providerId', new.provider_id,
      'modelId', new.model_id,
      'promptVersion', new.prompt_version,
      'contractVersion', new.contract_version,
      'inputHash', new.input_hash
    );
  else
    if tg_op = 'INSERT' then
      audit_action := 'ai.workflow.proposal_created';
    elsif old.status is distinct from new.status then
      audit_action := 'ai.workflow.proposal_status_changed';
    else
      return new;
    end if;
    audit_target_type := 'ai_workflow_proposal';
    audit_actor := coalesce(new.reviewed_by, auth.uid());
    audit_metadata := jsonb_build_object(
      'runId', new.run_id,
      'artifactType', new.artifact_type,
      'status', new.status,
      'confidence', new.confidence,
      'contractVersion', new.contract_version,
      'warningCount', jsonb_array_length(new.warnings)
    );
  end if;

  insert into audit_logs (
    tenant_id,
    project_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata,
    created_at
  ) values (
    new.tenant_id,
    new.project_id,
    audit_actor,
    audit_action,
    audit_target_type,
    new.id,
    audit_metadata,
    now()
  );

  return new;
end;
$$;

drop trigger if exists ai_workflow_runs_audit on ai_workflow_runs;
create trigger ai_workflow_runs_audit
after insert or update on ai_workflow_runs
for each row execute function audit_ai_workflow_change();

drop trigger if exists ai_workflow_proposals_audit on ai_workflow_proposals;
create trigger ai_workflow_proposals_audit
after insert or update on ai_workflow_proposals
for each row execute function audit_ai_workflow_change();

revoke all on function set_ai_workflow_updated_at() from public, anon;
revoke all on function audit_ai_workflow_change() from public, anon;
