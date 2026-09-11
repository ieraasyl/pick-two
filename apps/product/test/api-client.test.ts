import { QueryClient } from "@tanstack/react-query";
import { roomQueries } from "../src/lib/rooms.js";
import { afterEach, expect, expectTypeOf, test, vi } from "vite-plus/test";
import type { InferRequestType } from "hono/client";
import { z } from "zod";
import { api, ApiError, readResponse } from "../src/lib/api.js";
import type { RoomInput } from "../shared/contracts/rooms.js";
import type { voteInput } from "../shared/contracts/voting.js";
import type { visibilityInput } from "../shared/contracts/results.js";

// These assertions fail type checking if route validation stops exposing RPC request types.
expectTypeOf<InferRequestType<typeof api.api.rooms.$post>["json"]>().toEqualTypeOf<RoomInput>();
expectTypeOf<
  InferRequestType<(typeof api.api.rooms)[":id"]["$put"]>["json"]
>().toEqualTypeOf<RoomInput>();
expectTypeOf<
  InferRequestType<(typeof api.api.voting)[":token"]["votes"]["$post"]>["json"]
>().toEqualTypeOf<z.infer<typeof voteInput>>();
expectTypeOf<
  InferRequestType<(typeof api.api.rooms)[":id"]["results-visibility"]["$put"]>["json"]
>().toEqualTypeOf<z.infer<typeof visibilityInput>>();

afterEach(() => vi.restoreAllMocks());

test("RPC sends JSON with same-origin URLs and no-store", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "draft" }));
  const json = { question: "Lunch?", options: ["Soup", "Rice", "Pasta", "Salad"] };
  const response = await api.api.rooms[":id"].$put({ param: { id: "room-one" }, json });
  expect(response.status).toBe(200);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/rooms/room-one");
  expect(init).toMatchObject({ method: "PUT", body: JSON.stringify(json), cache: "no-store" });
  expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
});

test("API errors retain status, stable code, and request ID", async () => {
  const response = Response.json(
    { error: { code: "VOTE_CONFLICT", message: "Refresh your ballot.", requestId: "request-1" } },
    { status: 409 },
  );
  await expect(readResponse(Promise.resolve(response), z.object({}))).rejects.toMatchObject({
    name: "ApiError",
    status: 409,
    code: "VOTE_CONFLICT",
    requestId: "request-1",
    message: "Refresh your ballot.",
  });
});

test("unexpected responses and network failures use safe messages", async () => {
  const schema = z.object({ status: z.literal("ok") });
  await expect(
    readResponse(
      Promise.resolve(
        new Response("internal proxy details", {
          status: 502,
          headers: { "X-Request-ID": "request-2" },
        }),
      ),
      schema,
    ),
  ).rejects.toMatchObject({
    code: "REQUEST_FAILED",
    status: 502,
    requestId: "request-2",
    message: "Unable to complete the request. Please try again.",
  });
  await expect(
    readResponse(Promise.resolve(Response.json({ status: "wrong" })), schema),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  await expect(
    readResponse(Promise.reject(new TypeError("fetch failed")), schema),
  ).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  const aborted = new DOMException("Aborted", "AbortError");
  await expect(readResponse(Promise.reject(aborted), schema)).rejects.toBe(aborted);
  expect(new ApiError("Example", 400, "INVALID_REQUEST")).toBeInstanceOf(Error);
});

test("room queries encode identifiers and propagate cancellation signals", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({ error: { code: "NOT_FOUND", message: "Room not found" } }, { status: 404 }),
    );
  const client = new QueryClient();
  try {
    await expect(client.fetchQuery(roomQueries.detail("room/with?#"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/room%2Fwith%3F%23");
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  } finally {
    client.clear();
  }
});
