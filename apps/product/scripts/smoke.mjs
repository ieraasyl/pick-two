import assert from "node:assert/strict";

const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, "https:", "Smoke tests require an HTTPS origin");
assert.equal(origin.pathname, "/");
assert.equal(origin.search, "");
assert.equal(origin.hash, "");

async function request(path) {
  const response = await fetch(new URL(path, origin), {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.headers.get("X-Content-Type-Options"), `${path}: missing security headers`);
  return response;
}

for (const path of ["/api/health", "/api/ready"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(response.headers.get("X-Request-ID"));
}

// These reads exercise auth configuration and migrated tables without creating accounts or email.
const session = await request("/api/auth/get-session");
assert.equal(session.status, 200, "Session endpoint must be available");
assert.equal(await session.json(), null);
const rooms = await request("/api/rooms");
assert.equal(rooms.status, 401, "Rooms must require authentication");
assert.equal((await rooms.json()).error.code, "UNAUTHORIZED");

const page = await request("/sign-in");
assert.equal(page.status, 200);
assert.match(page.headers.get("Content-Type") ?? "", /text\/html/);
const html = await page.text();
assert.match(html, /id="root"/);
const script = html.match(
  /<script[^>]+src="([^"]+)"[^>]*type="module"|<script[^>]+type="module"[^>]+src="([^"]+)"/,
);
assert.ok(script, "SPA module script must be present");
const asset = await request(script[1] ?? script[2]);
assert.equal(asset.status, 200);
assert.match(asset.headers.get("Content-Type") ?? "", /javascript/);
console.log(`Smoke checks passed for ${origin.origin}`);
