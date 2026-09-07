import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "./db/client.js";

const app = new Hono<{ Bindings: Env }>()
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

export type AppType = typeof app;

export { app };
