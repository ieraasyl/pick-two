import type { BallotState } from "../../shared/contracts/voting.js";

export class VotingError extends Error {
  status: 404 | 409;
  code: string;
  constructor(status: 404 | 409, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function readBallot(
  env: Env,
  token: string,
  participantId: string,
): Promise<BallotState> {
  // One statement keeps progress and the assigned comparison in the same database snapshot.
  const row = await env.DB.prepare(`SELECT r.question, r.status, b.id AS ballot_id,
    (SELECT count(*) FROM options WHERE room_id = r.id) AS option_count,
    (SELECT count(*) FROM ballot_comparisons WHERE ballot_id = b.id) AS total,
    (SELECT count(*) FROM pairwise_votes v JOIN ballot_comparisons bc ON bc.id = v.comparison_id WHERE bc.ballot_id = b.id) AS completed,
    c.id AS comparison_id, l.id AS left_id, l.label AS left_label, o.id AS right_id, o.label AS right_label
    FROM rooms r LEFT JOIN ballots b ON b.room_id = r.id AND b.participant_id = ?
    LEFT JOIN ballot_comparisons c ON c.id = (
      SELECT bc.id FROM ballot_comparisons bc WHERE bc.ballot_id = b.id
      AND NOT EXISTS (SELECT 1 FROM pairwise_votes v WHERE v.comparison_id = bc.id)
      ORDER BY bc.position LIMIT 1)
    LEFT JOIN options l ON l.id = c.left_id LEFT JOIN options o ON o.id = c.right_id
    WHERE r.share_token = ? AND r.status IN ('open', 'closed')`)
    .bind(participantId, token)
    .first<{
      question: string;
      status: string;
      ballot_id: string | null;
      option_count: number;
      total: number;
      completed: number;
      comparison_id: string | null;
      left_id: string;
      left_label: string;
      right_id: string;
      right_label: string;
    }>();
  if (!row) throw new VotingError(404, "NOT_FOUND", "This voting link is unavailable.");
  const state =
    row.status === "closed"
      ? "closed"
      : !row.ballot_id
        ? "ready"
        : row.comparison_id
          ? "voting"
          : "complete";
  const choices: [{ id: string; label: string }, { id: string; label: string }] = [
    { id: row.left_id, label: row.left_label },
    { id: row.right_id, label: row.right_label },
  ];
  // Stable per-comparison side randomization avoids a fixed option always appearing first.
  if (row.comparison_id && parseInt(row.comparison_id[0], 16) % 2) choices.reverse();
  return {
    question: row.question,
    state,
    completed: row.completed,
    total: row.ballot_id ? row.total : (row.option_count * (row.option_count - 1)) / 2,
    comparison: state === "voting" && row.comparison_id ? { id: row.comparison_id, choices } : null,
  };
}
export async function startBallot(env: Env, token: string, participantId: string) {
  const state = await readBallot(env, token, participantId);
  if (state.state !== "ready") return state;
  const candidates = await env.DB.prepare(
    "SELECT o.id FROM options o JOIN rooms r ON r.id = o.room_id WHERE r.share_token = ? AND r.status = 'open' ORDER BY o.id",
  )
    .bind(token)
    .all<{ id: string }>();
  const pairs: { id: string; leftId: string; rightId: string }[] = [];
  for (let i = 0; i < candidates.results.length; i++)
    for (let j = i + 1; j < candidates.results.length; j++)
      pairs.push({
        id: crypto.randomUUID(),
        leftId: candidates.results[i].id,
        rightId: candidates.results[j].id,
      });
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ballots (id, room_id, participant_id, created_at)
      SELECT ?, id, ?, ? FROM rooms WHERE share_token = ? AND status = 'open'
      ON CONFLICT(room_id, participant_id) DO NOTHING`).bind(id, participantId, Date.now(), token),
    env.DB.prepare(`INSERT INTO ballot_comparisons (id, ballot_id, left_id, right_id, position)
      SELECT json_extract(value, '$.id'), b.id, json_extract(value, '$.leftId'), json_extract(value, '$.rightId'), CAST(key AS INTEGER)
      FROM json_each(?) JOIN ballots b ON b.id = ?`).bind(JSON.stringify(pairs), id),
  ]);
  return readBallot(env, token, participantId);
}
export async function castVote(
  env: Env,
  token: string,
  participantId: string,
  comparisonId: string,
  winnerId: string,
) {
  const result =
    await env.DB.prepare(`INSERT INTO pairwise_votes (id, comparison_id, winner_id, created_at)
    SELECT ?, c.id, ?, ? FROM ballot_comparisons c JOIN ballots b ON b.id = c.ballot_id JOIN rooms r ON r.id = b.room_id
    WHERE c.id = ? AND b.participant_id = ? AND r.share_token = ? AND r.status = 'open'
      AND ? IN (c.left_id, c.right_id)
      AND NOT EXISTS (SELECT 1 FROM ballot_comparisons prior WHERE prior.ballot_id = b.id AND prior.position < c.position
        AND NOT EXISTS (SELECT 1 FROM pairwise_votes v WHERE v.comparison_id = prior.id))
    ON CONFLICT(comparison_id) DO NOTHING RETURNING id`)
      .bind(crypto.randomUUID(), winnerId, Date.now(), comparisonId, participantId, token, winnerId)
      .first();
  if (!result)
    throw new VotingError(
      409,
      "VOTE_CONFLICT",
      "This comparison is no longer available. Your ballot has been refreshed.",
    );
  return readBallot(env, token, participantId);
}
