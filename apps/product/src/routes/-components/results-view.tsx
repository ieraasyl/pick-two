import { useQuery } from "@tanstack/react-query";
import { resultsQuery, type ResultsSource } from "@/lib/results";
import { Button } from "@/components/ui/button";
export function ResultsView({ source }: { source: ResultsSource }) {
  const query = useQuery(resultsQuery(source));
  if (query.isPending) return <p role="status">Loading results…</p>;
  if (query.isError)
    return (
      <div className="space-y-4">
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  const data = query.data;
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{data.question}</h1>
        <h2 className="mt-2 text-xl">
          {data.status === "closed" ? "Final results" : "Results so far"}
        </h2>
      </div>
      <p>
        {data.ballots} ballots started · {data.completedBallots} completed · {data.comparisons}{" "}
        comparisons
      </p>
      <p className="text-sm text-muted-foreground">
        Scores show the percentage of comparisons won. All saved choices count, including unfinished
        ballots. Ties share a rank; untested options are unranked. These results describe
        participant preferences, not statistical certainty.
      </p>
      {data.comparisons === 0 && (
        <p role="status">No votes yet. Rankings will appear after the first comparison.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Option rankings by win percentage</caption>
          <thead>
            <tr>
              <th className="p-3">Rank</th>
              <th className="p-3">Option</th>
              <th className="p-3">Win rate</th>
              <th className="p-3">Wins / losses</th>
            </tr>
          </thead>
          <tbody>
            {data.ranking.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.rank ?? "—"}</td>
                <th scope="row" className="max-w-80 p-3 wrap-break-word">
                  {row.label}
                </th>
                <td className="p-3">
                  {row.score === null ? "Unranked" : `${row.score.toFixed(1)}%`}
                </td>
                <td className="p-3">
                  {row.wins} / {row.losses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        {query.isFetching ? "Refreshing…" : "Refresh results"}
      </Button>
    </section>
  );
}
