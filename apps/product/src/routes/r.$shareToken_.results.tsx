import { createFileRoute, Link } from "@tanstack/react-router";
import { ResultsView } from "./-components/results-view";
export const Route = createFileRoute("/r/$shareToken_/results")({ component: PublicResults });
function PublicResults() {
  const { shareToken } = Route.useParams();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <Link to="/r/$shareToken" params={{ shareToken }} className="underline">
        ← Voting room
      </Link>
      <ResultsView url={`/api/voting/${encodeURIComponent(shareToken)}/results`} />
    </main>
  );
}
