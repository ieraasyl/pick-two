import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAuth } from "./auth.js";
import { authBoundary } from "./middleware/auth-handler.js";
import { requireSession } from "./middleware/session.js";
import { createDb } from "./db/client.js";
import { roomRoutes } from "./routes/rooms.js";

const app = new Hono<{ Bindings: Env }>()
  .use("/api/auth/*", bodyLimit({ maxSize: 16 * 1024 }), authBoundary)
  .on(["GET", "POST"], "/api/auth/*", (context) =>
    createAuth(context.env, context.executionCtx).handler(context.req.raw),
  )
  .get("/api/me", requireSession, (context) => {
    const { user } = context.get("authSession");
    return context.json({ user: { id: user.id, name: user.name, email: user.email } });
  })
  .route("/api/rooms", roomRoutes)
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

app.onError((_error, context) => {
  context.header("Cache-Control", "no-store");
  console.error(JSON.stringify({ code: "API_UNAVAILABLE" }));
  return context.json(
    { error: { code: "API_UNAVAILABLE", message: "Service is temporarily unavailable" } },
    503,
  );
});

export type AppType = typeof app;

export { app };
