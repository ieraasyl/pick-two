import { validateJson } from "../middleware/validate-json.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { roomInput } from "../../shared/contracts/rooms.js";
import { requireSession, type AuthEnvironment } from "../middleware/session.js";
import {
  archiveRoom,
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
  .post(
    "/",
    validateJson(roomInput, "INVALID_ROOM", "Provide a question and 4–5 unique options"),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(
        { room: { id: await createRoom(c.env, c.get("authSession").user.id, input) } },
        201,
      );
    },
  )
  .get("/:id/results", async (c) =>
    c.json(
      await getResults(c.env, { ownerId: c.get("authSession").user.id, id: c.req.param("id") }),
    ),
  )
  .put(
    "/:id/results-visibility",
    validateJson(visibilityInput, "INVALID_VISIBILITY", "Choose a valid visibility"),
    async (c) => {
      const input = c.req.valid("json");
      await setVisibility(
        c.env,
        c.get("authSession").user.id,
        c.req.param("id"),
        input.resultsVisibility,
      );
      return c.json(input);
    },
  )
  .get("/:id", async (c) =>
    c.json(await getRoom(c.env, c.get("authSession").user.id, c.req.param("id"))),
  )
  .put(
    "/:id",
    validateJson(roomInput, "INVALID_ROOM", "Provide a question and 4–5 unique options"),
    async (c) => {
      const input = c.req.valid("json");
      await editRoom(c.env, c.get("authSession").user.id, c.req.param("id"), input);
      return c.json({ status: "draft" as const });
    },
  )
  .post("/:id/archive", async (c) =>
    c.json(await archiveRoom(c.env, c.get("authSession").user.id, c.req.param("id"), "archive")),
  )
  .post("/:id/restore", async (c) =>
    c.json(await archiveRoom(c.env, c.get("authSession").user.id, c.req.param("id"), "restore")),
  )
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
