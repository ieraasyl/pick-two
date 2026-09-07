import { env } from "cloudflare:workers";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createAuth } from "../worker/auth.js";
import { app } from "../worker/app.js";
import { createDb } from "../worker/db/client.js";
import { user, account } from "../worker/db/auth-schema.js";
import { rooms, options } from "../worker/db/schema.js";
import { createdRoom, roomDetail, roomList } from "../shared/contracts/rooms.js";

const db = createDb(env.DB);
const owners: string[] = [];
const draft = { question: "Pick a name", options: ["Orbit", "Kite", "Juniper", "Northstar"] };
async function creator() {
  const id = crypto.randomUUID();
  owners.push(id);
  const email = `${id}@example.com`;
  const password = "room-test-password-123";
  await db.insert(user).values({
    id,
    email,
    name: "Creator",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: "credential",
    password: await hashPassword(password),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const response = await createAuth(env).api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  return {
    id,
    cookie: response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; "),
  };
}
async function request(cookie: string, path = "", method = "GET", body?: unknown) {
  return app.request(
    `/api/rooms${path}`,
    {
      method,
      headers: { Cookie: cookie, Origin: env.BETTER_AUTH_URL, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}
async function create(cookie: string) {
  const response = await request(cookie, "", "POST", draft);
  expect(response.status, await response.clone().text()).toBe(201);
  return createdRoom.parse(await response.json()).room.id;
}
afterEach(async () => {
  await env.DB.prepare("DROP TRIGGER IF EXISTS reject_room_options").run();
  for (const id of owners.splice(0)) await db.delete(user).where(eq(user.id, id));
  vi.restoreAllMocks();
});

test("owners can create, list, read, and edit drafts while other users cannot access them", async () => {
  const owner = await creator();
  const stranger = await creator();
  const id = await create(owner.cookie);
  expect(
    roomList.parse(await (await request(owner.cookie)).json()).rooms.map((room) => room.id),
  ).toContain(id);
  expect(roomList.parse(await (await request(stranger.cookie)).json()).rooms).toHaveLength(0);
  for (const [path, method, body] of [
    [`/${id}`, "GET", undefined],
    [`/${id}`, "PUT", draft],
    [`/${id}/publish`, "POST", undefined],
    [`/${id}/close`, "POST", undefined],
  ] as const) {
    expect((await request(stranger.cookie, path, method, body)).status).toBe(404);
    expect((await request("", path, method, body)).status).toBe(401);
  }
  expect((await request("", "", "POST", draft)).status).toBe(401);
  const edited = { question: "Choose lunch", options: ["Pasta", "Soup", "Salad", "Pizza", "Rice"] };
  expect((await request(owner.cookie, `/${id}`, "PUT", edited)).status).toBe(200);
  const detail = roomDetail.parse(await (await request(owner.cookie, `/${id}`)).json());
  expect(detail.room.question).toBe(edited.question);
  expect(detail.options.map((option) => option.label)).toEqual(edited.options);
});

test("room input is validated and creation cannot override ownership", async () => {
  const owner = await creator();
  for (const body of [
    { ...draft, question: " " },
    { ...draft, options: ["a", "b", "c"] },
    { ...draft, options: ["a", " a ", "b", "c"] },
    { ...draft, options: Array.from({ length: 13 }, (_, i) => String(i)) },
  ]) {
    expect((await request(owner.cookie, "", "POST", body)).status).toBe(400);
  }
  expect(await db.select().from(rooms).where(eq(rooms.ownerId, owner.id))).toHaveLength(0);
  const response = await request(owner.cookie, "", "POST", {
    ...draft,
    ownerId: "someone-else",
    status: "open",
  });
  const id = createdRoom.parse(await response.json()).room.id;
  const detail = roomDetail.parse(await (await request(owner.cookie, `/${id}`)).json());
  expect(detail.room).toMatchObject({ ownerId: owner.id, status: "draft" });
  expect(
    (
      await app.request(
        "/api/rooms",
        {
          method: "POST",
          headers: { Cookie: owner.cookie, Origin: "https://other.example.com" },
          body: JSON.stringify(draft),
        },
        env,
      )
    ).status,
  ).toBe(403);
});

test("failed option inserts roll back creation and draft replacement", async () => {
  const owner = await creator();
  const id = await create(owner.cookie);
  const before = roomDetail.parse(await (await request(owner.cookie, `/${id}`)).json());
  await env.DB.prepare(
    "CREATE TRIGGER reject_room_options BEFORE INSERT ON options BEGIN SELECT RAISE(ABORT, 'forced option failure'); END",
  ).run();
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await request(owner.cookie, "", "POST", draft)).status).toBe(503);
  expect(await db.select().from(rooms).where(eq(rooms.ownerId, owner.id))).toHaveLength(1);
  expect(
    (await request(owner.cookie, `/${id}`, "PUT", { ...draft, question: "Should roll back" }))
      .status,
  ).toBe(503);
  expect(roomDetail.parse(await (await request(owner.cookie, `/${id}`)).json())).toEqual(before);
});

test("concurrent publishing succeeds once and closed rooms cannot reopen or be edited", async () => {
  const owner = await creator();
  const id = await create(owner.cookie);
  const published = await Promise.all(
    Array.from({ length: 4 }, () => request(owner.cookie, `/${id}/publish`, "POST")),
  );
  expect(published.map((response) => response.status).sort((a, b) => a - b)).toEqual([
    200, 409, 409, 409,
  ]);
  expect((await request(owner.cookie, `/${id}`, "PUT", draft)).status).toBe(409);
  expect((await request(owner.cookie, `/${id}/close`, "POST")).status).toBe(200);
  for (const action of ["publish", "close"])
    expect((await request(owner.cookie, `/${id}/${action}`, "POST")).status).toBe(409);
  expect((await request(owner.cookie, `/${id}`, "PUT", draft)).status).toBe(409);
  expect(roomDetail.parse(await (await request(owner.cookie, `/${id}`)).json()).room.status).toBe(
    "closed",
  );
});

test("publishing racing a draft edit never leaves partial options", async () => {
  const owner = await creator();
  const id = await create(owner.cookie);
  const edited = { question: "Edited", options: ["One", "Two", "Three", "Four", "Five"] };
  const [edit, publish] = await Promise.all([
    request(owner.cookie, `/${id}`, "PUT", edited),
    request(owner.cookie, `/${id}/publish`, "POST"),
  ]);
  expect([200, 409]).toContain(edit.status);
  expect(publish.status).toBe(200);
  const detail = roomDetail.parse(await (await request(owner.cookie, `/${id}`)).json());
  expect(detail.room.status).toBe("open");
  expect(detail.options.map((option) => option.label)).toEqual(
    edit.status === 200 ? edited.options : draft.options,
  );
  expect(detail.room.question).toBe(edit.status === 200 ? edited.question : draft.question);
});

test("ownership is required and deleting the owner cascades to rooms and options", async () => {
  const owner = await creator();
  const id = await create(owner.cookie);
  await expect(
    env.DB.prepare(
      "INSERT INTO rooms (id, question, created_at, updated_at) VALUES ('no-owner', 'Question', 1, 1)",
    ).run(),
  ).rejects.toThrow();
  await db.delete(user).where(eq(user.id, owner.id));
  expect(await db.select().from(rooms).where(eq(rooms.id, id))).toHaveLength(0);
  expect(await db.select().from(options).where(eq(options.roomId, id))).toHaveLength(0);
});
