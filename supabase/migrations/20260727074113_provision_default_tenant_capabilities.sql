create or replace function public.provision_default_tenant_capabilities()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.tenant_capabilities (
    tenant_id,
    capability,
    enabled,
    created_at,
    updated_at
  )
  values
    (new.id, 'ai_chat', true, now(), now()),
    (new.id, 'client_runtime', true, now(), now()),
    (new.id, 'dataset_preview', true, now(), now()),
    (new.id, 'report_exports', true, now(), now())
  on conflict (tenant_id, capability) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_default_tenant_capabilities() from public, anon;
grant execute on function public.provision_default_tenant_capabilities() to authenticated, service_role;

drop trigger if exists provision_default_tenant_capabilities_after_activation on public.tenants;
create trigger provision_default_tenant_capabilities_after_activation
after insert or update of status on public.tenants
for each row
when (new.status = 'active')
execute function public.provision_default_tenant_capabilities();

insert into public.tenant_capabilities (
  tenant_id,
  capability,
  enabled,
  created_at,
  updated_at
)
select
  tenant.id,
  defaults.capability,
  true,
  now(),
  now()
from public.tenants as tenant
cross join (
  values
    ('ai_chat'),
    ('client_runtime'),
    ('dataset_preview'),
    ('report_exports')
) as defaults(capability)
where tenant.status = 'active'
on conflict (tenant_id, capability) do nothing;

comment on function public.provision_default_tenant_capabilities() is
  'Provision default enabled capabilities for newly active tenants while preserving explicit capability overrides.';
