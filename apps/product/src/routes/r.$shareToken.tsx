import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { ballotQuery, ballotMutation } from "@/lib/voting";

export const Route = createFileRoute("/r/$shareToken")({ component: Ballot });
function Ballot() {
  const { shareToken } = Route.useParams();
  const client = useQueryClient();
  const query = useQuery(ballotQuery(shareToken));
  const mutation = useMutation(ballotMutation(client, shareToken));
  const pending = mutation.isPending;
  const error = mutation.error?.message;
  const data = query.data;
  return (
    <div className="min-h-svh bg-background">
      <header className="flex items-center justify-between p-6">
        <span className="text-xl font-semibold">
          Pick Two<span className="text-primary">.</span>
        </span>
        <ModeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        {query.isPending ? (
          <p role="status">Loading your ballot…</p>
        ) : query.isError || !data ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Unable to load this ballot</h1>
            <p role="alert">{query.error?.message ?? "Please try again."}</p>
            <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            <h1 className="text-center text-3xl font-semibold sm:text-4xl">{data.question}</h1>
            {error && (
              <p role="alert" className="rounded-xl border p-4 text-sm">
                {error}
              </p>
            )}
            {data.state === "closed" ? (
              <section className="space-y-3 text-center">
                <h2 className="text-2xl font-medium">Voting is closed</h2>
                <p>Thanks for your interest. This room is no longer accepting choices.</p>
              </section>
            ) : data.state === "complete" ? (
              <section className="space-y-3 text-center">
                <h2 className="text-2xl font-medium">You’re all done!</h2>
                <p>Thanks for sharing your choices. All {data.total} comparisons are saved.</p>
              </section>
            ) : data.state === "ready" ? (
              <section className="space-y-5 text-center">
                <p>
                  Choose your preferred option in each pair. {data.total} comparisons, no account
                  needed.
                </p>
                <p className="text-sm text-muted-foreground">
                  You can return on this browser to finish. Cookies keep your progress.
                </p>
                <Button disabled={pending} onClick={() => mutation.mutate(undefined)}>
                  {pending ? "Starting…" : "Start voting"}
                </Button>
              </section>
            ) : data.comparison ? (
              <section className="space-y-6" aria-label="Pairwise voting" aria-busy={pending}>
                <div className="space-y-2">
                  <p role="status" className="text-center text-sm text-muted-foreground">
                    {data.completed} of {data.total} comparisons completed
                  </p>
                  <progress
                    aria-label="Ballot progress"
                    className="h-2 w-full accent-primary"
                    value={data.completed}
                    max={data.total}
                  />
                </div>
                <h2 className="text-center text-xl">Which do you prefer?</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.comparison.choices.map((choice) => (
                    <Button
                      key={`${data.comparison!.id}:${choice.id}`}
                      variant="outline"
                      className="h-auto min-h-36 px-6 py-10 text-xl wrap-break-word whitespace-normal"
                      disabled={pending || query.isFetching}
                      onClick={() =>
                        mutation.mutate({
                          comparisonId: data.comparison!.id,
                          winnerId: choice.id,
                        })
                      }
                    >
                      {choice.label}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
        <Link
          to="/r/$shareToken/results"
          params={{ shareToken }}
          className="mt-8 inline-block underline"
        >
          View results when available
        </Link>
      </main>
    </div>
  );
}
