-- Trigger functions are implementation details, not Data API RPC endpoints.
-- Keep their execution owned by the trigger path and remove direct client access.

alter function public.handle_new_user()
  set search_path = public, pg_temp;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

revoke all on function public.set_ai_workflow_updated_at()
  from public, anon, authenticated;

revoke all on function public.audit_ai_workflow_change()
  from public, anon, authenticated;

revoke all on function public.set_schema_profile_updated_at()
  from public, anon, authenticated;
