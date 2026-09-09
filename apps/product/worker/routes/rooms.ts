import { rateLimit } from "../middleware/rate-limit.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { roomInput } from "../../shared/contracts/rooms.js";
import { requireSession, type AuthEnvironment } from "../middleware/session.js";
import {
  createRoom,
  editRoom,
  getRoom,
  listRooms,
  RoomError,
  transitionRoom,
} from "../services/rooms.js";

import { getResults, setVisibility } from "../services/results.js";
import { visibilityInput } from "../../shared/contracts/results.js";

export const roomRoutes = new Hono<AuthEnvironment>()
  .use("*", bodyLimit({ maxSize: 16 * 1024 }), rateLimit("creator", 120), requireSession)
  .use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.header("Origin") !== c.env.BETTER_AUTH_URL)
      return c.json({ error: { code: "INVALID_ORIGIN", message: "Invalid origin" } }, 403);
    await next();
  })
  .get("/", async (c) => c.json({ rooms: await listRooms(c.env, c.get("authSession").user.id) }))
  .post("/", async (c) => {
    const input = roomInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: { code: "INVALID_ROOM", message: "Provide a question and 4–12 unique options" } },
        400,
      );
    return c.json(
      { room: { id: await createRoom(c.env, c.get("authSession").user.id, input.data) } },
      201,
    );
  })
  .get("/:id/results", async (c) =>
    c.json(
      await getResults(c.env, { ownerId: c.get("authSession").user.id, id: c.req.param("id") }),
    ),
  )
  .put("/:id/results-visibility", async (c) => {
    const input = visibilityInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: { code: "INVALID_VISIBILITY", message: "Choose a valid visibility" } },
        400,
      );
    await setVisibility(
      c.env,
      c.get("authSession").user.id,
      c.req.param("id"),
      input.data.resultsVisibility,
    );
    return c.json(input.data);
  })
  .get("/:id", async (c) =>
    c.json(await getRoom(c.env, c.get("authSession").user.id, c.req.param("id"))),
  )
  .put("/:id", async (c) => {
    const input = roomInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: { code: "INVALID_ROOM", message: "Provide a question and 4–12 unique options" } },
        400,
      );
    await editRoom(c.env, c.get("authSession").user.id, c.req.param("id"), input.data);
    return c.json({ status: "draft" as const });
  })
  .post("/:id/publish", async (c) =>
    c.json({
      status: await transitionRoom(
        c.env,
        c.get("authSession").user.id,
        c.req.param("id"),
        "publish",
      ),
    }),
  )
  .post("/:id/close", async (c) =>
    c.json({
      status: await transitionRoom(c.env, c.get("authSession").user.id, c.req.param("id"), "close"),
    }),
  );

roomRoutes.onError((error, c) => {
  if (error instanceof RoomError)
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  throw error;
});
