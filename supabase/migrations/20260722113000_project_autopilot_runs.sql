create table if not exists project_autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'awaiting_review', 'succeeded', 'failed', 'cancelled'
  )),
  current_step text not null default 'schema_scope' check (current_step in (
    'schema_scope', 'semantic_model', 'dataset', 'charts', 'publish_review'
  )),
  brief jsonb not null,
  plan jsonb not null default '{}'::jsonb,
  artifacts jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, project_id),
  unique (tenant_id, project_id, idempotency_key)
);

create table if not exists project_autopilot_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  step_key text not null check (step_key in (
    'schema_scope', 'semantic_model', 'dataset', 'charts', 'publish_review'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'ready', 'running', 'awaiting_review', 'succeeded', 'blocked', 'failed', 'skipped'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, step_key),
  constraint project_autopilot_steps_scoped_run_fk
    foreign key (run_id, tenant_id, project_id)
    references project_autopilot_runs(id, tenant_id, project_id)
    on delete cascade
);

create index if not exists idx_project_autopilot_runs_project_created
on project_autopilot_runs (tenant_id, project_id, created_at desc);

create index if not exists idx_project_autopilot_steps_run
on project_autopilot_steps (run_id, created_at);

alter table project_autopilot_runs enable row level security;
alter table project_autopilot_steps enable row level security;

grant select, insert, update on project_autopilot_runs to authenticated;
grant select, insert, update on project_autopilot_steps to authenticated;
grant all on project_autopilot_runs to service_role;
grant all on project_autopilot_steps to service_role;

drop policy if exists "autopilot runs readable by project access" on project_autopilot_runs;
drop policy if exists "autopilot runs creatable by project editors" on project_autopilot_runs;
drop policy if exists "autopilot runs mutable by project editors" on project_autopilot_runs;
drop policy if exists "autopilot steps readable by project access" on project_autopilot_steps;
drop policy if exists "autopilot steps creatable by project editors" on project_autopilot_steps;
drop policy if exists "autopilot steps mutable by project editors" on project_autopilot_steps;

create policy "autopilot runs readable by project access"
on project_autopilot_runs for select to authenticated
using (has_project_access(project_id));

create policy "autopilot runs creatable by project editors"
on project_autopilot_runs for insert to authenticated
with check (actor_user_id = auth.uid() and can_publish_project(project_id));

create policy "autopilot runs mutable by project editors"
on project_autopilot_runs for update to authenticated
using (can_publish_project(project_id))
with check (can_publish_project(project_id));

create policy "autopilot steps readable by project access"
on project_autopilot_steps for select to authenticated
using (has_project_access(project_id));

create policy "autopilot steps creatable by project editors"
on project_autopilot_steps for insert to authenticated
with check (can_publish_project(project_id));

create policy "autopilot steps mutable by project editors"
on project_autopilot_steps for update to authenticated
using (can_publish_project(project_id))
with check (can_publish_project(project_id));

create or replace function set_project_autopilot_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_autopilot_runs_set_updated_at on project_autopilot_runs;
create trigger project_autopilot_runs_set_updated_at
before update on project_autopilot_runs
for each row execute function set_project_autopilot_updated_at();

drop trigger if exists project_autopilot_steps_set_updated_at on project_autopilot_steps;
create trigger project_autopilot_steps_set_updated_at
before update on project_autopilot_steps
for each row execute function set_project_autopilot_updated_at();

revoke all on function set_project_autopilot_updated_at() from public, anon;

comment on table project_autopilot_runs is
  'Durable, resumable project-level orchestration that never performs final dashboard publication.';

comment on table project_autopilot_steps is
  'Idempotent Autopilot step state and review evidence for one project run.';
