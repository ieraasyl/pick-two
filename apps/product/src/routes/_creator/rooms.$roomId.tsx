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
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
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
      <section className="space-y-3 rounded-xl border p-5" aria-label="Results settings">
        <Link to="/rooms/$roomId/results" params={{ roomId }} className="underline">
          View results
        </Link>
        <label className="block text-sm">
          Public results
          <select
            className="mt-2 block rounded-lg border bg-background p-3"
            value={room.resultsVisibility}
            disabled={pending}
            onChange={async (event) => {
              setPending(true);
              setError("");
              try {
                const response = await fetch(
                  `/api/rooms/${encodeURIComponent(roomId)}/results-visibility`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ resultsVisibility: event.target.value }),
                  },
                );
                if (!response.ok)
                  throw new Error("Unable to save results visibility. Please try again.");
              } catch (error) {
                setError(error instanceof Error ? error.message : "Unable to save visibility");
              } finally {
                await refresh();
                setPending(false);
              }
            }}
          >
            <option value="private">Private — only you</option>
            <option value="after_close">Public after voting closes</option>
            <option value="always">Public while open and after closing</option>
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          Public results are available to anyone with the voting link when permitted by this
          setting.
        </p>
      </section>
      {room.shareToken && (
        <section className="space-y-3 rounded-xl border p-5" aria-labelledby="sharing-heading">
          <h2 id="sharing-heading" className="text-lg font-semibold">
            Share voting link
          </h2>
          <label className="block text-sm">
            Voting link
            <input
              readOnly
              value={`${window.location.origin}/r/${room.shareToken}`}
              className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
              onFocus={(event) => event.target.select()}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={async () => {
                setCopied(false);
                setCopyError("");
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/r/${room.shareToken}`,
                  );
                  setCopied(true);
                } catch {
                  setCopyError("Select and copy the link above.");
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a
              href={`/r/${room.shareToken}`}
              target="_blank"
              rel="noreferrer"
              className="self-center text-sm underline"
            >
              Open voting page
            </a>
          </div>
          {copied && (
            <p role="status" className="text-sm">
              Link copied.
            </p>
          )}
          {copyError && (
            <p role="alert" className="text-sm">
              {copyError}
            </p>
          )}
        </section>
      )}
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
