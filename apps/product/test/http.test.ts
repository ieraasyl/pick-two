import { env } from "cloudflare:workers";
import { expect, test, vi } from "vite-plus/test";
import { app } from "../worker/app.js";
import { consumeAuthLimit } from "../worker/services/auth-rate-limit.js";

test("requests get unique server IDs and logs contain templates, not sensitive input", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const token = "b".repeat(48);
    const response = await app.request(
      `/api/voting/${token}/results?secret=hidden`,
      {
        headers: { "X-Request-ID": "untrusted", "cf-connecting-ip": crypto.randomUUID() },
      },
      env,
    );
    expect(response.status).toBe(404);
    const requestId = response.headers.get("X-Request-ID");
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND", requestId } });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    const record = JSON.parse(log.mock.calls.at(-1)![0]);
    expect(record).toMatchObject({ requestId, route: "/api/voting/:token/results", status: 404 });
    expect(JSON.stringify(record)).not.toContain(token);
    expect(JSON.stringify(record)).not.toContain("hidden");
    const next = await app.request("/api/health", {}, env);
    expect(next.headers.get("X-Request-ID")).not.toBe(requestId);
  } finally {
    log.mockRestore();
  }
});

test("unknown routes and body limits use JSON errors; auth keeps its client fields", async () => {
  const missing = await app.request("/api/missing", {}, env);
  expect(await missing.json()).toMatchObject({
    error: { code: "NOT_FOUND", requestId: expect.any(String) },
  });
  for (const path of [
    "/api/rooms",
    "/api/auth/sign-in/email",
    `/api/voting/${"a".repeat(48)}/votes`,
  ]) {
    const response = await app.request(path, { method: "POST", body: "x".repeat(17000) }, env);
    expect(response.status).toBe(413);
    const body = (await response.json()) as { code?: string; error: { code: string } };
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
    if (path.includes("/auth/")) expect(body.code).toBe("PAYLOAD_TOO_LARGE");
  }
});

test("unexpected failures are sanitized and still have trace and security headers", async () => {
  const broken = {
    ...env,
    DB: {
      prepare() {
        throw new Error("secret database details");
      },
    } as unknown as D1Database,
  };
  const response = await app.request("https://app.example.com/api/rooms", {}, broken);
  expect(response.status).toBe(503);
  expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  expect(await response.json()).toEqual({
    error: {
      code: "API_UNAVAILABLE",
      message: "Service is temporarily unavailable",
      requestId: response.headers.get("X-Request-ID"),
    },
  });
});

test("read and creator limits reject before expensive handlers and preserve Retry-After", async () => {
  for (const [bucket, path] of [
    ["public-read", `/api/voting/${"a".repeat(48)}/results`],
    ["creator", "/api/rooms"],
    ["session-read", "/api/auth/get-session"],
    ["me-read", "/api/me"],
  ]) {
    const ip = crypto.randomUUID();
    await consumeAuthLimit(env, `${bucket}:${ip}`, 120, 60);
    // Seed the boundary rather than sending 120 unrelated requests.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${bucket}:${ip}`),
    );
    const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("UPDATE auth_rate_limits SET count = 120 WHERE key = ?").bind(key).run();
    const response = await app.request(path, { headers: { "cf-connecting-ip": ip } }, env);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toMatchObject({
      error: { code: "RATE_LIMITED", requestId: expect.any(String) },
    });
  }
});
