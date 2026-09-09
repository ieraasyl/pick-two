import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { roomQueries } from "@/lib/rooms";
import { Button } from "@/components/ui/button";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";

export const Route = createFileRoute("/_creator/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const rooms = useQuery(roomQueries.list);
  const [archived, setArchived] = useState(false);
  const visibleRooms = rooms.data?.rooms.filter((room) => (room.archivedAt !== null) === archived);
  return (
    <>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      </header>
      <section aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className="mb-4 text-lg font-semibold">
          Ranking rooms
        </h2>
        <div className="mb-4 flex gap-2" role="group" aria-label="Room filter">
          <Button
            variant={archived ? "outline" : "default"}
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
          >
            Active
          </Button>
          <Button
            variant={archived ? "default" : "outline"}
            aria-pressed={archived}
            onClick={() => setArchived(true)}
          >
            Archived
          </Button>
        </div>
        {rooms.isLoading ? (
          <p role="status">Loading rooms…</p>
        ) : rooms.isError ? (
          <div className="space-y-3">
            <p role="alert">Unable to load rooms. Please try again.</p>
            <Button onClick={() => void rooms.refetch()} disabled={rooms.isFetching}>
              Try again
            </Button>
          </div>
        ) : visibleRooms?.length ? (
          <div className="space-y-3">
            {visibleRooms.map((room) => (
              <Link
                key={room.id}
                to="/rooms/$roomId"
                params={{ roomId: room.id }}
                className="block rounded-2xl border bg-card p-5 hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{room.question}</span>
                  <span className="text-sm text-muted-foreground capitalize">{room.status}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-card-foreground">
            <div className="mb-5 rounded-2xl bg-muted p-4 text-muted-foreground">
              <StackIcon size={28} aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium">
              {archived ? "No archived rooms" : "No ranking rooms yet"}
            </h3>
          </div>
        )}
      </section>
      <Link
        to="/rooms/new"
        className="mt-6 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Create ranking room
      </Link>
    </>
  );
}
