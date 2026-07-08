create table if not exists ai_chart_refinement_rollout_policies (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'tenant', 'project', 'user')),
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_chart_refinement_rollout_scope_shape check (
    (
      scope_type = 'global'
      and tenant_id is null
      and project_id is null
      and user_id is null
    )
    or (
      scope_type = 'tenant'
      and tenant_id is not null
      and project_id is null
      and user_id is null
    )
    or (
      scope_type = 'project'
      and tenant_id is not null
      and project_id is not null
      and user_id is null
    )
    or (
      scope_type = 'user'
      and tenant_id is not null
      and project_id is not null
      and user_id is not null
    )
  )
);

create unique index if not exists idx_ai_chart_refinement_rollout_global
on ai_chart_refinement_rollout_policies (scope_type)
where scope_type = 'global';

create unique index if not exists idx_ai_chart_refinement_rollout_tenant
on ai_chart_refinement_rollout_policies (tenant_id)
where scope_type = 'tenant';

create unique index if not exists idx_ai_chart_refinement_rollout_project
on ai_chart_refinement_rollout_policies (tenant_id, project_id)
where scope_type = 'project';

create unique index if not exists idx_ai_chart_refinement_rollout_user
on ai_chart_refinement_rollout_policies (tenant_id, project_id, user_id)
where scope_type = 'user';

create index if not exists idx_ai_chart_refinement_rollout_scope
on ai_chart_refinement_rollout_policies (tenant_id, project_id, user_id, scope_type, enabled);

alter table ai_chart_refinement_rollout_policies enable row level security;

grant select, insert, update, delete on ai_chart_refinement_rollout_policies to authenticated;

drop policy if exists "ai chart refinement rollout readable by access" on ai_chart_refinement_rollout_policies;
drop policy if exists "ai chart refinement rollout writable by admins" on ai_chart_refinement_rollout_policies;

create policy "ai chart refinement rollout readable by access"
on ai_chart_refinement_rollout_policies for select
to authenticated
using (
  scope_type = 'global'
  or is_platform_admin()
  or (tenant_id is not null and has_tenant_access(tenant_id))
  or (project_id is not null and has_project_access(project_id))
  or user_id = auth.uid()
);

create policy "ai chart refinement rollout writable by admins"
on ai_chart_refinement_rollout_policies for all
to authenticated
using (
  is_platform_admin()
  or (
    scope_type = 'tenant'
    and tenant_id is not null
    and exists (
      select 1
      from tenant_memberships tm
      where tm.tenant_id = ai_chart_refinement_rollout_policies.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  )
  or (
    scope_type in ('project', 'user')
    and project_id is not null
    and can_publish_project(project_id)
  )
)
with check (
  (
    is_platform_admin()
    or (
      scope_type = 'tenant'
      and tenant_id is not null
      and exists (
        select 1
        from tenant_memberships tm
        where tm.tenant_id = ai_chart_refinement_rollout_policies.tenant_id
          and tm.user_id = auth.uid()
          and tm.role in ('owner', 'admin')
      )
    )
    or (
      scope_type in ('project', 'user')
      and project_id is not null
      and can_publish_project(project_id)
    )
  )
  and updated_by = auth.uid()
);
