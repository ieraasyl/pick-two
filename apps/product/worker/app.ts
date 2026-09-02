import { Hono } from "hono";

const app = new Hono().get("/api/health", (context) => context.json({ status: "ok" }));

export type AppType = typeof app;

export { app };
