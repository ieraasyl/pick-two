import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { app } from "../worker/app.js";
import { createDb } from "../worker/db/client.js";
import { user, session, verification, authRateLimits } from "../worker/db/auth-schema.js";

const googleEnv = {
  ...env,
  GOOGLE_CLIENT_ID: "google-test-client",
  GOOGLE_CLIENT_SECRET: "google-test-secret",
};
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const body = { provider: "google", callbackURL: "/dashboard", errorCallbackURL: "/sign-in" };
function start(input: object = body, origin = env.BETTER_AUTH_URL, bindings = googleEnv) {
  return app.fetch(
    new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(input),
    }),
    bindings,
    createExecutionContext(),
  );
}
function callback(query: URLSearchParams, cookie = "") {
  return app.fetch(
    new Request(`${env.BETTER_AUTH_URL}/api/auth/callback/google?${query.toString()}`, {
      headers: { Cookie: cookie },
    }),
    googleEnv,
    createExecutionContext(),
  );
}
function base64url(data: Uint8Array) {
  return btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
async function mockGoogle(
  email = "google@example.com",
  verified = true,
  claims: Record<string, unknown> = {},
) {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("publicKey" in keys)) throw new Error("Expected an RSA key pair");
  const exported = await crypto.subtle.exportKey("jwk", keys.publicKey);
  if (exported instanceof ArrayBuffer) throw new Error("Expected a JSON web key");
  const jwk = {
    ...exported,
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  const encode = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({ iss: "https://accounts.google.com", aud: googleEnv.GOOGLE_CLIENT_ID, sub: "google-subject", email, email_verified: verified, name: "Google Creator", iat: now, exp: now + 3600, ...claims })}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(unsigned),
  );
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.body instanceof URLSearchParams ? init.body.toString() : init?.body).toContain(
      "code_verifier=",
    );
    return Response.json({
      access_token: "test-access",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    });
  });
}
async function complete() {
  const started = await start();
  expect(started.status).toBe(200);
  const { url } = (await started.json()) as { url: string };
  const query = new URLSearchParams({
    state: new URL(url).searchParams.get("state")!,
    code: "google-code",
  });
  return { response: await callback(query, cookies(started)), query, cookie: cookies(started) };
}
afterEach(async () => {
  vi.restoreAllMocks();
  const db = createDb(env.DB);
  await db.delete(session);
  await db.delete(user);
  await db.delete(verification);
  await db.delete(authRateLimits);
});

test("Google redirect uses state, PKCE, the configured client, and the exact callback", async () => {
  const response = await start();
  expect(response.status).toBe(200);
  const url = new URL(((await response.json()) as { url: string }).url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("client_id")).toBe(googleEnv.GOOGLE_CLIENT_ID);
  expect(url.searchParams.get("redirect_uri")).toBe(
    `${env.BETTER_AUTH_URL}/api/auth/callback/google`,
  );
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(response.headers.getSetCookie().join(";")).toContain("HttpOnly");
});

test("Google rejects cross-origin starts, unsupported inputs, and missing credentials", async () => {
  expect((await start(body, "https://evil.example")).status).toBe(403);
  for (const input of [
    { ...body, provider: "github" },
    { ...body, callbackURL: "https://evil.example" },
    { ...body, idToken: { token: "untrusted" } },
  ])
    expect((await start(input)).status).toBe(400);
  expect(
    (await start(body, env.BETTER_AUTH_URL, { ...googleEnv, GOOGLE_CLIENT_SECRET: "" })).status,
  ).toBe(503);
});

test("Google creates a verified creator session, supports returning sign-in, and rejects callback replay", async () => {
  await mockGoogle();
  const { response, query, cookie } = await complete();
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe("/dashboard");
  const me = await app.fetch(
    new Request(`${env.BETTER_AUTH_URL}/api/me`, { headers: { Cookie: cookies(response) } }),
    googleEnv,
    createExecutionContext(),
  );
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ user: { email: "google@example.com" } });
  const replay = await callback(query, cookie);
  expect(replay.headers.get("Location")).toContain("error=");
  expect(cookies(replay)).not.toContain("session_token");
  expect((await complete()).response.headers.get("Location")).toBe("/dashboard");
  expect(await createDb(env.DB).select().from(user)).toHaveLength(1);
});

test("Google callback rejects missing browser state and cancellation without creating a session", async () => {
  const fetch = await mockGoogle();
  const started = await start();
  const url = new URL(((await started.json()) as { url: string }).url);
  const query = new URLSearchParams({ state: url.searchParams.get("state")!, code: "code" });
  expect((await callback(query)).headers.get("Location")).toContain("error=");
  const canceled = await start();
  const canceledUrl = new URL(((await canceled.json()) as { url: string }).url);
  expect(
    (
      await callback(
        new URLSearchParams({
          state: canceledUrl.searchParams.get("state")!,
          error: "access_denied",
        }),
        cookies(canceled),
      )
    ).headers.get("Location"),
  ).toContain("error=access_denied");
  expect(fetch).not.toHaveBeenCalled();
  expect(await createDb(env.DB).select().from(session)).toHaveLength(0);
});

test.each([false, true])(
  "Google links an existing email only when locally verified: %s",
  async (emailVerified) => {
    await mockGoogle();
    const db = createDb(env.DB);
    await db.insert(user).values({
      id: "existing",
      name: "Existing",
      email: "google@example.com",
      emailVerified,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { response } = await complete();
    expect(response.headers.get("Location")).toBe(
      emailVerified ? "/dashboard" : "/sign-in?error=account_not_linked",
    );
    expect(await db.select().from(user)).toHaveLength(1);
    expect(await db.select().from(session)).toHaveLength(emailVerified ? 1 : 0);
  },
);

test("Google identities without verified email cannot register", async () => {
  await mockGoogle("unverified@example.com", false);
  expect((await complete()).response.headers.get("Location")).toContain("error=email_not_verified");
  expect(await createDb(env.DB).select().from(user)).toHaveLength(0);
});

test.each([{ aud: "wrong-client" }, { iss: "https://evil.example" }, { exp: 1 }])(
  "Google rejects invalid token claims: %j",
  async (claims) => {
    await mockGoogle("google@example.com", true, claims);
    expect((await complete()).response.headers.get("Location")).toContain("error=");
    expect(await createDb(env.DB).select().from(user)).toHaveLength(0);
    expect(await createDb(env.DB).select().from(session)).toHaveLength(0);
  },
);

test("Google start and callback requests are rate limited", async () => {
  for (let attempt = 0; attempt < 31; attempt++) {
    const response = await start();
    expect(response.status).toBe(attempt < 30 ? 200 : 429);
  }
  for (let attempt = 0; attempt < 31; attempt++) {
    const response = await callback(
      new URLSearchParams({ state: "invalid", error: "access_denied" }),
    );
    expect(response.status).toBe(attempt < 30 ? 302 : 429);
    if (attempt === 30) expect(response.headers.get("Retry-After")).toBe("60");
  }
});
