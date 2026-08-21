/** Skeleton shown while a dashboard page's server data resolves. */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-lg bg-line/70" />
      <div className="mt-2.5 h-4 w-80 rounded bg-line/50" />

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-5 ring-1 ring-line">
            <div className="h-3 w-24 rounded bg-line/60" />
            <div className="mt-3 h-7 w-16 rounded bg-line/70" />
            <div className="mt-2.5 h-3 w-32 rounded bg-line/40" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="h-72 rounded-xl bg-white ring-1 ring-line" />
        <div className="h-72 rounded-xl bg-white ring-1 ring-line" />
      </div>
    </div>
  );
}
