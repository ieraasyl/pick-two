import { createFileRoute } from "@tanstack/react-router";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";

export const Route = createFileRoute("/_creator/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      </header>
      <section aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className="mb-4 text-lg font-semibold">
          Ranking rooms
        </h2>
        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-card-foreground">
          <div className="mb-5 rounded-2xl bg-muted p-4 text-muted-foreground">
            <StackIcon size={28} aria-hidden="true" />
          </div>
          <h3 className="text-lg font-medium">No ranking rooms yet</h3>
        </div>
      </section>
    </>
  );
}
