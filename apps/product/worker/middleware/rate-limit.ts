import { createMiddleware } from "hono/factory";
import { consumeAuthLimit } from "../services/auth-rate-limit.js";

export function rateLimit(bucket: string, max: number, methods?: string[]) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    if (methods && !methods.includes(c.req.method)) return next();
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    if (!(await consumeAuthLimit(c.env, `${bucket}:${ip}`, max, 60))) {
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
    await next();
  });
}
