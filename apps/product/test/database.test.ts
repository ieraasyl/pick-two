import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, test } from "vite-plus/test";
import { app } from "../worker/app.js";
import { createDb } from "../worker/db/client.js";
import { rooms } from "../worker/db/schema.js";
import { user } from "../worker/db/auth-schema.js";

test("GET /api/ready confirms database connectivity", async () => {
  const response = await exports.default.fetch("https://example.com/api/ready");
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});

test("readiness fails safely while health remains available without a database", async () => {
  const unavailableEnv = {
    ...env,
    DB: {
      prepare() {
        throw new Error("Private database failure details");
      },
    } as unknown as D1Database,
  };
  const ready = await app.request("/api/ready", {}, unavailableEnv);
  expect(ready.status).toBe(503);
  await expect(ready.json()).resolves.toEqual({
    error: { code: "DATABASE_UNAVAILABLE", message: "Database is unavailable" },
  });

  const health = await app.request("/api/health", {}, unavailableEnv);
  expect(health.status).toBe(200);
  await expect(health.json()).resolves.toEqual({ status: "ok" });
});

test("migrations create rooms with a draft default and millisecond timestamps", async () => {
  const db = createDb(env.DB);
  const ownerId = crypto.randomUUID();
  await createDb(env.DB)
    .insert(user)
    .values({
      id: ownerId,
      name: "Test",
      email: `${ownerId}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const room = {
    id: crypto.randomUUID(),
    ownerId,
    question: "What should we name our product?",
    createdAt: 1_788_780_000_123,
    updatedAt: 1_788_780_000_123,
  };
  try {
    await db.insert(rooms).values(room);
    const stored = await db.select().from(rooms).where(eq(rooms.id, room.id)).get();
    expect(stored).toEqual({ ...room, shareToken: null, status: "draft" });
  } finally {
    await db.delete(user).where(eq(user.id, ownerId));
  }
});

test("database rejects invalid room statuses and blank questions", async () => {
  const db = createDb(env.DB);
  const ownerId = crypto.randomUUID();
  await db.insert(user).values({
    id: ownerId,
    email: `${ownerId}@example.com`,
    name: "Test",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  try {
    for (const [question, status, constraint] of [
      ["A question?", "invalid", "rooms_status_check"],
      ["   ", "draft", "rooms_question_not_empty"],
    ]) {
      await expect(
        env.DB.prepare(
          "INSERT INTO rooms (id, owner_id, question, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(crypto.randomUUID(), ownerId, question, status, 1, 1)
          .run(),
      ).rejects.toThrow(constraint);
    }
  } finally {
    await db.delete(user).where(eq(user.id, ownerId));
  }
});
