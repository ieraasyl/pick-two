import { createFileRoute, Link } from "@tanstack/react-router";
import { ResultsView } from "../-components/results-view";
export const Route = createFileRoute("/_creator/rooms/$roomId_/results")({
  component: RoomResults,
});
function RoomResults() {
  const { roomId } = Route.useParams();
  return (
    <div className="space-y-6">
      <Link to="/rooms/$roomId" params={{ roomId }} className="underline">
        ← Manage room
      </Link>
      <ResultsView source={{ roomId }} />
    </div>
  );
}
