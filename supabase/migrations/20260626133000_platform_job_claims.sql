create or replace function claim_platform_jobs(batch_size integer, worker_id text)
returns setof platform_jobs
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from platform_jobs
    where status = 'queued'
      and run_after <= now()
    order by priority desc, run_after asc, created_at asc
    limit greatest(1, least(batch_size, 25))
    for update skip locked
  )
  update platform_jobs jobs
  set
    status = 'running',
    locked_by = worker_id,
    locked_at = now(),
    started_at = coalesce(jobs.started_at, now()),
    attempts = jobs.attempts + 1,
    error_message = null,
    updated_at = now()
  from picked
  where jobs.id = picked.id
  returning jobs.*;
$$;

grant execute on function claim_platform_jobs(integer, text) to service_role;
