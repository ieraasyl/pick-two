import { env } from "cloudflare:workers";
import { afterEach, expect, test } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { app } from "../worker/app.js";
import { createDb } from "../worker/db/client.js";
import { user } from "../worker/db/auth-schema.js";
import { rooms, ballots, ballotComparisons, pairwiseVotes } from "../worker/db/schema.js";
import { createRoom, transitionRoom } from "../worker/services/rooms.js";
import { ballotState } from "../shared/contracts/voting.js";

const db = createDb(env.DB);
const owners: string[] = [];
afterEach(async () => {
  for (const id of owners.splice(0)) await db.delete(user).where(eq(user.id, id));
});
async function room() {
  const owner = crypto.randomUUID();
  owners.push(owner);
  await db.insert(user).values({
    id: owner,
    email: `${owner}@example.com`,
    name: "Owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const id = await createRoom(env, owner, {
    question: "Choose a name",
    options: ["Orbit", "Kite", "Juniper", "Northstar"],
  });
  expect((await db.select().from(rooms).where(eq(rooms.id, id)).get())!.shareToken).toBeNull();
  await transitionRoom(env, owner, id, "publish");
  const token = (await db.select().from(rooms).where(eq(rooms.id, id)).get())!.shareToken!;
  expect(token).toMatch(/^[a-f0-9]{48}$/);
  return { id, owner, token };
}
async function req(token: string, cookie = "", path = "", body?: object) {
  return app.request(
    `/api/voting/${token}${path}`,
    {
      method: path ? "POST" : "GET",
      headers: { Cookie: cookie, Origin: env.BETTER_AUTH_URL, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    env,
  );
}
async function participant(token: string) {
  const response = await req(token);
  expect(response.status, await response.clone().text()).toBe(200);
  const cookies = response.headers.getSetCookie();
  expect(cookies.join(";")).toContain("HttpOnly");
  expect(cookies.join(";")).toContain("Secure");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(ballotState.parse(await response.json()).state).toBe("ready");
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}
async function start(token: string, cookie: string) {
  const response = await req(token, cookie, "/ballot");
  expect(response.status, await response.clone().text()).toBe(200);
  return ballotState.parse(await response.json());
}

test("anonymous ballots restore progress and finish every unique pair without exposing creator data", async () => {
  const { token } = await room();
  const cookie = await participant(token);
  let state = await start(token, cookie);
  expect(state.total).toBe(6);
  const pairs = new Set<string>();
  for (let i = 0; i < 6; i++) {
    expect(state.state).toBe("voting");
    expect(state.completed).toBe(i);
    const restored = ballotState.parse(await (await req(token, cookie)).json());
    expect(restored).toEqual(state);
    const comparison = state.comparison!;
    const pair = comparison.choices
      .map((choice) => choice.id)
      .sort()
      .join(":");
    expect(pairs.has(pair)).toBe(false);
    pairs.add(pair);
    const response = await req(token, cookie, "/votes", {
      comparisonId: comparison.id,
      winnerId: comparison.choices[0].id,
    });
    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(JSON.stringify(json)).not.toContain("ownerId");
    state = ballotState.parse(json);
  }
  expect(state).toMatchObject({ state: "complete", completed: 6, total: 6, comparison: null });
  expect(await start(token, cookie)).toEqual(state);
  expect(pairs.size).toBe(6);
});

test("concurrent starts reuse one ballot and duplicate votes count once", async () => {
  const { token, id } = await room();
  const cookie = await participant(token);
  const states = await Promise.all([start(token, cookie), start(token, cookie)]);
  expect(states[0]).toEqual(states[1]);
  expect(await db.select().from(ballots).where(eq(ballots.roomId, id))).toHaveLength(1);
  const comparison = states[0].comparison!;
  const body = { comparisonId: comparison.id, winnerId: comparison.choices[0].id };
  const responses = await Promise.all([
    req(token, cookie, "/votes", body),
    req(token, cookie, "/votes", body),
  ]);
  expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
  expect(ballotState.parse(await (await req(token, cookie)).json()).completed).toBe(1);
});

test("votes cannot select another ballot, an unassigned option, or skip ahead", async () => {
  const { token } = await room();
  const cookie = await participant(token);
  const state = await start(token, cookie);
  const comparison = state.comparison!;
  const stranger = await participant(token);
  await start(token, stranger);
  const assigned = await db
    .select()
    .from(ballotComparisons)
    .where(eq(ballotComparisons.id, comparison.id))
    .get();
  const future = (
    await db
      .select()
      .from(ballotComparisons)
      .where(eq(ballotComparisons.ballotId, assigned!.ballotId))
  ).find((row) => row.position === 1)!;
  for (const [identity, comparisonId, winnerId] of [
    [stranger, comparison.id, comparison.choices[0].id],
    [cookie, comparison.id, crypto.randomUUID()],
    [cookie, future.id, future.leftId],
  ])
    expect((await req(token, identity, "/votes", { comparisonId, winnerId })).status).toBe(409);
  expect(ballotState.parse(await (await req(token, cookie)).json()).completed).toBe(0);
  expect((await req(token, cookie, "/votes", { winnerId: "bad" })).status).toBe(400);
});

test("closed rooms reject pending votes and cannot create new ballots", async () => {
  const { token, id, owner } = await room();
  const cookie = await participant(token);
  const state = await start(token, cookie);
  const comparison = state.comparison!;
  await transitionRoom(env, owner, id, "close");
  expect(
    (
      await req(token, cookie, "/votes", {
        comparisonId: comparison.id,
        winnerId: comparison.choices[0].id,
      })
    ).status,
  ).toBe(409);
  expect(ballotState.parse(await (await req(token, cookie)).json())).toMatchObject({
    state: "closed",
    comparison: null,
    completed: 0,
  });
  const fresh = await req(token);
  const freshCookie = fresh.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  expect((await start(token, freshCookie)).state).toBe("closed");
  expect(await db.select().from(ballots).where(eq(ballots.roomId, id))).toHaveLength(1);
});

test("invalid links, unsigned cookies, and cross-origin submissions are rejected", async () => {
  const { token } = await room();
  for (const bad of ["invalid", "f".repeat(48)]) expect((await req(bad)).status).toBe(404);
  expect((await req(token, "", "/ballot")).status).toBe(400);
  expect((await req(token, "__Host-pick_two_participant=forged", "/ballot")).status).toBe(400);
  const cookie = await participant(token);
  const response = await app.request(
    `/api/voting/${token}/ballot`,
    { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.example" } },
    env,
  );
  expect(response.status).toBe(403);
});

test("deleting a room cascades its ballots, comparisons, and votes", async () => {
  const { token, id } = await room();
  const cookie = await participant(token);
  const state = await start(token, cookie);
  const comparison = state.comparison!;
  await req(token, cookie, "/votes", {
    comparisonId: comparison.id,
    winnerId: comparison.choices[0].id,
  });
  const assigned = await db
    .select()
    .from(ballotComparisons)
    .where(eq(ballotComparisons.id, comparison.id))
    .get();
  await db.delete(rooms).where(eq(rooms.id, id));
  expect(await db.select().from(ballots).where(eq(ballots.id, assigned!.ballotId))).toHaveLength(0);
  expect(
    await db
      .select()
      .from(ballotComparisons)
      .where(eq(ballotComparisons.ballotId, assigned!.ballotId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(pairwiseVotes).where(eq(pairwiseVotes.comparisonId, comparison.id)),
  ).toHaveLength(0);
});

test("a vote racing closure commits at most once and no votes can follow closure", async () => {
  const { token, id, owner } = await room();
  const cookie = await participant(token);
  const state = await start(token, cookie);
  const comparison = state.comparison!;
  const body = { comparisonId: comparison.id, winnerId: comparison.choices[0].id };
  const [response] = await Promise.all([
    req(token, cookie, "/votes", body),
    transitionRoom(env, owner, id, "close"),
  ]);
  expect([200, 409]).toContain(response.status);
  expect((await req(token, cookie, "/votes", body)).status).toBe(409);
  const final = ballotState.parse(await (await req(token, cookie)).json());
  expect(final.state).toBe("closed");
  expect(final.completed).toBe(response.status === 200 ? 1 : 0);
});

test("ballot starts are rate limited per IP", async () => {
  const { token } = await room();
  const cookie = await participant(token);
  for (let i = 0; i < 21; i++) {
    const response = await app.request(
      `/api/voting/${token}/ballot`,
      {
        method: "POST",
        headers: { Cookie: cookie, Origin: env.BETTER_AUTH_URL, "cf-connecting-ip": "192.0.2.222" },
      },
      env,
    );
    expect(response.status).toBe(i < 20 ? 200 : 429);
    if (i === 20) expect(response.headers.get("Retry-After")).toBe("60");
  }
});
