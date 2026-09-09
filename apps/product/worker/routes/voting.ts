import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { shareToken, voteInput } from "../../shared/contracts/voting.js";
import { castVote, readBallot, startBallot, VotingError } from "../services/voting.js";
import { consumeAuthLimit } from "../services/auth-rate-limit.js";

import { getResults } from "../services/results.js";
import { RoomError } from "../services/rooms.js";

export const votingRoutes = new Hono<{ Bindings: Env; Variables: { participant: string } }>()
  .use("*", bodyLimit({ maxSize: 2048 }))
  .use("/:token/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!shareToken.safeParse(c.req.param("token")).success)
      return c.json(
        { error: { code: "NOT_FOUND", message: "This voting link is unavailable." } },
        404,
      );
    const local = ["localhost", "127.0.0.1"].includes(new URL(c.env.BETTER_AUTH_URL).hostname);
    const cookieName = local ? "pick_two_participant" : "__Host-pick_two_participant";
    const participant = await getSignedCookie(c, c.env.BETTER_AUTH_SECRET, cookieName);
    c.set("participant", typeof participant === "string" ? participant : "");
    if (c.req.method !== "GET") {
      if (c.req.header("Origin") !== c.env.BETTER_AUTH_URL)
        return c.json({ error: { code: "INVALID_ORIGIN", message: "Invalid origin" } }, 403);
      if (!participant)
        return c.json(
          { error: { code: "COOKIES_REQUIRED", message: "Allow cookies and reload to vote." } },
          400,
        );
      const starting = c.req.path.endsWith("/ballot");
      const ip = c.req.header("cf-connecting-ip") ?? "local";
      if (
        !(await consumeAuthLimit(
          c.env,
          `voting:${starting ? "start" : "vote"}:${ip}`,
          starting ? 20 : 120,
          60,
        ))
      ) {
        c.header("Retry-After", "60");
        return c.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Too many requests. Wait a minute and try again.",
            },
          },
          429,
        );
      }
    } else if (!participant) {
      const id = crypto.randomUUID();
      c.set("participant", id);
      await setSignedCookie(c, cookieName, id, c.env.BETTER_AUTH_SECRET, {
        path: "/",
        httpOnly: true,
        secure: !local,
        sameSite: "Lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    await next();
  })
  .get("/:token/results", async (c) =>
    c.json(await getResults(c.env, { token: c.req.param("token") })),
  )
  .get("/:token", async (c) =>
    c.json(await readBallot(c.env, c.req.param("token"), c.get("participant"))),
  )
  .post("/:token/ballot", async (c) =>
    c.json(await startBallot(c.env, c.req.param("token"), c.get("participant"))),
  )
  .post("/:token/votes", async (c) => {
    const input = voteInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: { code: "INVALID_VOTE", message: "Choose one of the displayed options." } },
        400,
      );
    return c.json(
      await castVote(
        c.env,
        c.req.param("token"),
        c.get("participant"),
        input.data.comparisonId,
        input.data.winnerId,
      ),
    );
  });
votingRoutes.onError((error, c) => {
  if (error instanceof VotingError || error instanceof RoomError)
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  throw error;
});
