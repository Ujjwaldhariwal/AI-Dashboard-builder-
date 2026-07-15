// Component: Layout
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-28 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <section className="hidden flex-1 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur-xl lg:block">
          <p className="text-xs uppercase tracking-[0.25em] text-indigo-300">Governed analytics delivery</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-white">
            Move from database structure to a trusted client dashboard.
          </h1>
          <p className="mt-4 max-w-xl text-sm text-slate-300">
            Connect a read-only database, review inferred business meaning, approve semantic assets,
            validate release readiness, and publish an immutable dashboard version.
          </p>

          <div className="mt-8 grid gap-3 text-sm text-slate-200">
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              Guided schema and semantic review
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              Governed datasets and server-validated readiness
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              Immutable releases for the client-facing runtime
            </div>
          </div>
        </section>

        <main className="w-full lg:max-w-md">{children}</main>
      </div>
    </div>
  )
}
