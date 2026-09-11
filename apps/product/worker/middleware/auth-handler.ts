import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { consumeAuthLimit } from "../services/auth-rate-limit.js";

const emailBody = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });
const postPaths = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
  "/api/auth/sign-out",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/email-otp/send-verification-otp",
  "/api/auth/email-otp/verify-email",
]);

export const authBoundary = createMiddleware<{ Bindings: Env }>(async (context, next) => {
  context.header("Cache-Control", "no-store");
  const path = context.req.path;
  if (context.req.method === "GET" && path === "/api/auth/get-session") return next();
  if (context.req.method !== "POST" || !postPaths.has(path)) {
    return context.json({ code: "NOT_FOUND", message: "Not found" }, 404);
  }
  // Explicit origin enforcement also protects requests without browser Fetch Metadata headers.
  if (context.req.header("Origin") !== context.env.BETTER_AUTH_URL) {
    return context.json({ code: "INVALID_ORIGIN", message: "Invalid origin" }, 403);
  }
  const ip = context.req.header("cf-connecting-ip") ?? "local";
  if (!(await consumeAuthLimit(context.env, `ip:${ip}`, 30, 60))) {
    context.header("Retry-After", "60");
    return context.json(
      { code: "RATE_LIMITED", message: "Too many attempts. Try again later." },
      429,
    );
  }
  if (path === "/api/auth/sign-out" || path === "/api/auth/reset-password") return next();
  const body: unknown = await context.req.raw
    .clone()
    .json()
    .catch(() => null);
  const parsed = emailBody.safeParse(body);
  if (!parsed.success)
    return context.json({ code: "INVALID_EMAIL", message: "Enter a valid email address" }, 400);
  if (
    path === "/api/auth/email-otp/send-verification-otp" &&
    (!body || typeof body !== "object" || !("type" in body) || body.type !== "email-verification")
  ) {
    return context.json({ code: "INVALID_REQUEST", message: "Unsupported verification type" }, 400);
  }
  const issuesEmail =
    path === "/api/auth/sign-up/email" ||
    path === "/api/auth/email-otp/send-verification-otp" ||
    path === "/api/auth/request-password-reset";
  if (issuesEmail) {
    if (!context.env.RESEND_API_KEY || !context.env.AUTH_EMAIL_FROM) {
      return context.json(
        { code: "AUTH_UNAVAILABLE", message: "Authentication email is not configured" },
        503,
      );
    }
    if (!(await consumeAuthLimit(context.env, `email:${parsed.data.email}`, 3, 300))) {
      context.header("Retry-After", "300");
      return context.json(
        { code: "RATE_LIMITED", message: "Too many attempts. Try again later." },
        429,
      );
    }
  }
  await next();
});
