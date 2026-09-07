import { and, desc, eq, sql } from "drizzle-orm";
import { createDb } from "../db/client.js";
import { rooms, options } from "../db/schema.js";
import type { RoomInput } from "../../shared/contracts/rooms.js";

export class RoomError extends Error {
  code: "NOT_FOUND" | "INVALID_STATE";
  status: 404 | 409;
  constructor(code: "NOT_FOUND" | "INVALID_STATE", message: string, status: 404 | 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const owned = (id: string, ownerId: string) => and(eq(rooms.id, id), eq(rooms.ownerId, ownerId));
export function listRooms(env: Env, ownerId: string) {
  return createDb(env.DB)
    .select()
    .from(rooms)
    .where(eq(rooms.ownerId, ownerId))
    .orderBy(desc(rooms.updatedAt));
}
export async function getRoom(env: Env, ownerId: string, id: string) {
  const db = createDb(env.DB);
  const room = await db.select().from(rooms).where(owned(id, ownerId)).get();
  if (!room) throw new RoomError("NOT_FOUND", "Room not found", 404);
  return {
    room,
    options: await db
      .select()
      .from(options)
      .where(eq(options.roomId, id))
      .orderBy(options.position),
  };
}
export async function createRoom(env: Env, ownerId: string, input: RoomInput) {
  const db = createDb(env.DB);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db
      .insert(rooms)
      .values({ id, ownerId, question: input.question, createdAt: now, updatedAt: now }),
    db.insert(options).values(
      input.options.map((label, position) => ({
        id: crypto.randomUUID(),
        roomId: id,
        label,
        position,
      })),
    ),
  ]);
  return id;
}
export async function editRoom(env: Env, ownerId: string, id: string, input: RoomInput) {
  // Every statement checks ownership and draft state; D1 executes the batch as one transaction.
  const rows = input.options.map((label, position) => ({
    id: crypto.randomUUID(),
    label,
    position,
  }));
  const [updated] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE rooms SET question = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'draft' RETURNING id",
    ).bind(input.question, Date.now(), id, ownerId),
    env.DB.prepare(
      "DELETE FROM options WHERE room_id = ? AND EXISTS (SELECT 1 FROM rooms WHERE id = ? AND owner_id = ? AND status = 'draft')",
    ).bind(id, id, ownerId),
    env.DB.prepare(`INSERT INTO options (id, room_id, label, position)
      SELECT json_extract(value, '$.id'), rooms.id, json_extract(value, '$.label'), json_extract(value, '$.position')
      FROM json_each(?) JOIN rooms ON rooms.id = ? AND rooms.owner_id = ? AND rooms.status = 'draft'`).bind(
      JSON.stringify(rows),
      id,
      ownerId,
    ),
  ]);
  if (!updated.results.length) {
    await getRoom(env, ownerId, id);
    throw new RoomError("INVALID_STATE", "Only draft rooms can be edited", 409);
  }
}
export async function transitionRoom(
  env: Env,
  ownerId: string,
  id: string,
  action: "publish" | "close",
) {
  const db = createDb(env.DB);
  const status = action === "publish" ? "open" : "closed";
  const [updated] = await db
    .update(rooms)
    .set({ status, updatedAt: Date.now() })
    .where(
      and(
        owned(id, ownerId),
        eq(rooms.status, action === "publish" ? "draft" : "open"),
        action === "publish"
          ? sql`(SELECT count(*) FROM options WHERE room_id = ${id}) BETWEEN 4 AND 12`
          : undefined,
      ),
    )
    .returning({ id: rooms.id });
  if (!updated) {
    await getRoom(env, ownerId, id);
    throw new RoomError(
      "INVALID_STATE",
      "Room state changed or options are incomplete. Reload and try again.",
      409,
    );
  }
  return status;
}
