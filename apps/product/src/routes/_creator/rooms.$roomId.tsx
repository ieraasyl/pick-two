import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { roomQueries, editRoom, transitionRoom } from "@/lib/rooms";
import { RoomForm } from "./-components/room-form";

export const Route = createFileRoute("/_creator/rooms/$roomId")({ component: Room });
function Room() {
  const { roomId } = Route.useParams();
  const client = useQueryClient();
  const query = useQuery(roomQueries.detail(roomId));
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["room", roomId] }),
      client.invalidateQueries({ queryKey: ["rooms"] }),
    ]);
  }
  async function transition(action: "publish" | "close") {
    setPending(true);
    setError("");
    try {
      await transitionRoom(roomId, action);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to change room state. Please try again.",
      );
    } finally {
      await refresh();
      setPending(false);
    }
  }
  if (query.isLoading) return <p role="status">Loading room…</p>;
  if (query.isError || !query.data)
    return (
      <div className="space-y-3">
        <p role="alert">Unable to load this room.</p>
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  const { room, options } = query.data;
  return (
    <div className="max-w-3xl space-y-8">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← Dashboard
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{room.question}</h1>
          <p className="mt-2 text-muted-foreground capitalize">{room.status}</p>
        </div>
        <div className="flex gap-2">
          {room.status === "draft" && !editing && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => setEditing(true)}>
                Edit room
              </Button>
              <Button disabled={pending} onClick={() => void transition("publish")}>
                Publish
              </Button>
            </>
          )}
          {room.status === "open" && (
            <Button variant="outline" disabled={pending} onClick={() => void transition("close")}>
              Close voting
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && room.status === "draft" ? (
        <RoomForm
          key={roomId}
          initial={{ question: room.question, options: options.map((option) => option.label) }}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            await editRoom(roomId, input);
            setEditing(false);
            await refresh();
          }}
        />
      ) : (
        <section aria-labelledby="options-heading">
          <h2 id="options-heading" className="mb-3 text-lg font-semibold">
            Options
          </h2>
          <ol className="space-y-2">
            {options.map((option, index) => (
              <li key={option.id} className="rounded-xl border bg-card px-4 py-3">
                <span className="mr-3 text-muted-foreground">{index + 1}</span>
                {option.label}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
