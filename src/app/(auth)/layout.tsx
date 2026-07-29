import { BarChart3, CheckCircle2 } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1180px] items-stretch lg:grid-cols-[minmax(0,1.1fr)_minmax(23rem,0.72fr)]">
        <section className="hidden min-w-0 flex-col justify-between border-r border-[color:var(--color-rule)] px-10 py-12 lg:flex xl:px-16 xl:py-16">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-none">DashboardOS</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Managed analytics platform
              </p>
            </div>
          </div>

          <div className="max-w-2xl py-12">
            <p className="text-sm font-medium text-[var(--color-accent)]">
              Governed analytics delivery
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.025em] xl:text-5xl">
              From connected data to a trusted release.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--color-ink-2)]">
              Review business meaning, validate readiness, and publish immutable
              client dashboards from one governed workspace.
            </p>

            <ol className="mt-10 border-y border-[color:var(--color-rule)]">
              {[
                [
                  "01",
                  "Connect",
                  "Use a tenant-scoped, read-only data source.",
                ],
                [
                  "02",
                  "Review",
                  "Confirm schema, semantic assets, and governed datasets.",
                ],
                [
                  "03",
                  "Release",
                  "Publish a validated, immutable dashboard version.",
                ],
              ].map(([step, title, description]) => (
                <li
                  key={step}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-b border-[color:var(--color-rule)] py-5 last:border-b-0"
                >
                  <span className="font-mono text-xs text-[var(--color-accent)]">
                    {step}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <CheckCircle2
              className="h-4 w-4 text-[var(--color-success)]"
              aria-hidden="true"
            />
            Invite-only access for assigned tenant projects
          </div>
        </section>

        <main className="flex min-w-0 items-center px-4 py-8 sm:px-8 lg:px-10 xl:px-14">
          {children}
        </main>
      </div>
    </div>
  );
}
