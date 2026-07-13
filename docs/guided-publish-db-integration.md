# Guided Publish DB Integration

The DB-backed guided publish integration spec is opt-in so default local and CI runs do not mutate a shared Supabase project.

Run it with:

```powershell
$env:DASHBOARDOS_INTEGRATION_SUPABASE = "1"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"
npx playwright test tests/guided-publish-db-integration.spec.ts --workers=1
```

The spec also reads `.env.local` when shell variables are absent, but it only runs when `DASHBOARDOS_INTEGRATION_SUPABASE=1`.

The fixture creates a real Supabase auth user, seeds one tenant-scoped guided project plus one unassigned project, signs in through the anon client, and calls the actual Next route handlers with that authenticated Supabase context. Seed data is deleted after the serial suite by removing the tenant cascade and deleting the auth user.

Publish-time validation remains authoritative. The preflight route is checked first, then the publish route re-evaluates readiness and records the persisted publish event metadata.
