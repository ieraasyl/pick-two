import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

const fallbackErrors: Record<number, { code: string; message: string }> = {
  400: { code: "INVALID_REQUEST", message: "Invalid request" },
  401: { code: "UNAUTHORIZED", message: "Sign in to continue" },
  403: { code: "FORBIDDEN", message: "Request not permitted" },
  404: { code: "NOT_FOUND", message: "Not found" },
  413: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
  429: { code: "RATE_LIMITED", message: "Too many requests. Try again later." },
};

// Wrap early middleware returns as well as route and framework errors.
export const httpBoundary = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  await next();
  let code: string | undefined;
  if (c.res.status >= 400) {
    const body = await c.res
      .clone()
      .json()
      .catch(() => null);
    const record = (value: unknown): Record<string, unknown> =>
      value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const candidate = record(record(body).error ?? body);
    const fallback = fallbackErrors[c.res.status] ?? {
      code: "API_UNAVAILABLE",
      message: "Service is temporarily unavailable",
    };
    const error = {
      code: typeof candidate?.code === "string" ? candidate.code : fallback.code,
      message: typeof candidate?.message === "string" ? candidate.message : fallback.message,
      requestId,
    };
    code = error.code;
    const headers = new Headers(c.res.headers);
    headers.delete("Content-Length");
    headers.set("Content-Type", "application/json; charset=UTF-8");
    // Better Auth's client requires the top-level code and message.
    c.res = new Response(
      JSON.stringify(
        c.req.path.startsWith("/api/auth/")
          ? { code: error.code, message: error.message, error }
          : { error },
      ),
      { status: c.res.status, headers },
    );
  }
  c.header("X-Request-ID", requestId);
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (new URL(c.req.url).protocol === "https:")
    c.header("Strict-Transport-Security", "max-age=31536000");
  // Only templates: never log IDs, share tokens, queries, or arbitrary unknown paths.
  console.log(
    JSON.stringify({
      event: "http_request",
      environment: c.env.APP_ENV,
      requestId,
      method: c.req.method,
      route: routePath(c) ?? "unmatched",
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
      ...(code ? { code } : {}),
    }),
  );
});
