import { rankOptions } from "./ranking.js";
import { RoomError } from "./rooms.js";
import type { Results } from "../../shared/contracts/results.js";
export async function getResults(
  env: Env,
  lookup: { ownerId: string; id: string } | { token: string },
): Promise<Results> {
  const publicRequest = "token" in lookup;
  const predicate = publicRequest ? "share_token = ?" : "id = ? AND owner_id = ?";
  const args = publicRequest ? [lookup.token] : [lookup.id, lookup.ownerId];
  // D1 batch reads use one transaction, keeping totals and visibility in the same snapshot.
  const [roomData, optionData, voteData, ballotData] = await env.DB.batch([
    env.DB.prepare(
      `SELECT question, status, results_visibility FROM rooms WHERE ${predicate}`,
    ).bind(...args),
    env.DB.prepare(
      `SELECT id, label, position FROM options WHERE room_id IN (SELECT id FROM rooms WHERE ${predicate})`,
    ).bind(...args),
    env.DB.prepare(
      `SELECT v.winner_id AS winnerId, CASE WHEN v.winner_id = c.left_id THEN c.right_id ELSE c.left_id END AS loserId FROM pairwise_votes v JOIN ballot_comparisons c ON c.id = v.comparison_id JOIN ballots b ON b.id = c.ballot_id WHERE b.room_id IN (SELECT id FROM rooms WHERE ${predicate})`,
    ).bind(...args),
    env.DB.prepare(
      `SELECT b.id, NOT EXISTS (SELECT 1 FROM ballot_comparisons c WHERE c.ballot_id = b.id AND NOT EXISTS (SELECT 1 FROM pairwise_votes v WHERE v.comparison_id = c.id)) AS complete FROM ballots b WHERE room_id IN (SELECT id FROM rooms WHERE ${predicate})`,
    ).bind(...args),
  ]);
  const room = roomData.results[0] as
    | { question: string; status: Results["status"]; results_visibility: string }
    | undefined;
  if (
    !room ||
    (publicRequest &&
      (room.status === "draft" ||
        room.results_visibility === "private" ||
        (room.results_visibility === "after_close" && room.status !== "closed")))
  )
    throw new RoomError("NOT_FOUND", "Results are not available", 404);
  return {
    question: room.question as string,
    status: room.status as Results["status"],
    ballots: ballotData.results.length,
    completedBallots: (ballotData.results as { complete: number }[]).filter((b) => b.complete === 1)
      .length,
    comparisons: voteData.results.length,
    ranking: rankOptions(
      optionData.results as { id: string; label: string; position: number }[],
      voteData.results as { winnerId: string; loserId: string }[],
    ),
  };
}
export async function setVisibility(
  env: Env,
  ownerId: string,
  id: string,
  visibility: "private" | "after_close" | "always",
) {
  const updated = await env.DB.prepare(
    "UPDATE rooms SET results_visibility = ?, updated_at = ? WHERE id = ? AND owner_id = ? RETURNING id",
  )
    .bind(visibility, Date.now(), id, ownerId)
    .first();
  if (!updated) throw new RoomError("NOT_FOUND", "Room not found", 404);
}
