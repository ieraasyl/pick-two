import { httpBoundary } from "./middleware/http.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAuth } from "./auth.js";
import { authBoundary } from "./middleware/auth-handler.js";
import { requireSession } from "./middleware/session.js";
import { createDb } from "./db/client.js";
import { votingRoutes } from "./routes/voting.js";
import { roomRoutes } from "./routes/rooms.js";

const app = new Hono<{ Bindings: Env }>()
  .use("/api/*", httpBoundary)
  .use("/api/auth/get-session", rateLimit("session-read", 120))
  .use("/api/me", rateLimit("me-read", 120))
  .use("/api/auth/*", bodyLimit({ maxSize: 16 * 1024 }), authBoundary)
  .on(["GET", "POST"], "/api/auth/*", (context) =>
    createAuth(context.env, context.executionCtx).handler(context.req.raw),
  )
  .get("/api/me", requireSession, (context) => {
    const { user } = context.get("authSession");
    return context.json({ user: { id: user.id, name: user.name, email: user.email } });
  })
  .route("/api/rooms", roomRoutes)
  .route("/api/voting", votingRoutes)
  .get("/api/health", (context) => context.json({ status: "ok" }))
  .get("/api/ready", async (context) => {
    try {
      await createDb(context.env.DB).get(sql`SELECT 1`);
      return context.json({ status: "ok" });
    } catch {
      return context.json(
        { error: { code: "DATABASE_UNAVAILABLE", message: "Database is unavailable" } },
        503,
      );
    }
  });

app.onError((error, context) => {
  if (error instanceof HTTPException) return error.getResponse();
  context.header("Cache-Control", "no-store");
  return context.json(
    { error: { code: "API_UNAVAILABLE", message: "Service is temporarily unavailable" } },
    503,
  );
});

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));

export type AppType = typeof app;

export { app };
