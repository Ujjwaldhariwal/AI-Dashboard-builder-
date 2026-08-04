# Guided Publish DB Integration

The DB-backed guided publish integration spec is opt-in so default local and CI runs do not mutate a shared Supabase project.

Run the route-handler integration with:

```powershell
$env:DASHBOARDOS_INTEGRATION_SUPABASE = "1"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"
npx playwright test tests/guided-publish-db-integration.spec.ts --workers=1
```

The spec also reads `.env.local` when shell variables are absent, but it only runs when `DASHBOARDOS_INTEGRATION_SUPABASE=1`.

Run the live HTTP/browser-cookie integration with a running app server:

```powershell
$env:DASHBOARDOS_INTEGRATION_SUPABASE = "1"
$env:DASHBOARDOS_LIVE_HTTP_GUIDED_PUBLISH = "1"
$env:DASHBOARDOS_BASE_URL = "http://localhost:3000"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"
npx playwright test e2e/guided-publish-live-auth.spec.ts --workers=1
```

The fixture creates a real Supabase auth user whose email matches the app's employee-id login convention, seeds one tenant-scoped guided project plus one unassigned project, signs in through the anon client for handler-level tests, and signs in through `/login` for the live HTTP test. Seed data is deleted after each serial suite by removing the tenant cascade and deleting the auth user.

Publish-time validation remains authoritative. The preflight route is checked first, then the publish route re-evaluates readiness and records the persisted publish event metadata.

## GitHub Actions

The `Guided Publish Integration` and `Release Readiness` workflows fail closed when live acceptance secrets are missing. They do not report a successful skipped job.

Configure these repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Optional repository variable:

- `NEXT_PUBLIC_EMAIL_DOMAIN`, defaulting to `company.com`

No permanent live-auth email or password secrets are needed. The service-role fixture creates a short-lived confirmed user, signs in through the normal password flow, and deletes that user during cleanup.

The workflow first requires aligned migration history, then runs route-handler DB integration, builds the app, starts `next start` on `127.0.0.1:3000`, and runs the live browser-cookie integration. Use a dedicated production-like acceptance project because the fixture creates and deletes auth users plus tenant-scoped records.
