import { env, exports } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { app } from "../worker/app.js";
import { createDb } from "../worker/db/client.js";
import { user, session, verification, authRateLimits } from "../worker/db/auth-schema.js";
import { consumeAuthLimit } from "../worker/services/auth-rate-limit.js";

const password = "a-long-test-password-123";
const messages: { to: string[]; text: string }[] = [];

beforeEach(() => {
  messages.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    expect(input).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-only-resend-key");
    if (typeof init?.body !== "string") throw new Error("Expected a JSON body");
    messages.push(JSON.parse(init.body));
    return Response.json({ id: crypto.randomUUID() });
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  const db = createDb(env.DB);
  await db.delete(session);
  await db.delete(user);
  await db.delete(verification);
  await db.delete(authRateLimits);
});

async function post(
  path: string,
  body: object,
  cookie = "",
  origin = env.BETTER_AUTH_URL,
  ip = "192.0.2.1",
) {
  const context = createExecutionContext();
  const response = await app.fetch(
    new Request(`${env.BETTER_AUTH_URL}/api/auth/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: cookie,
        "cf-connecting-ip": ip,
      },
      body: JSON.stringify(body),
    }),
    env,
    context,
  );
  await waitOnExecutionContext(context);
  return response;
}

async function signUp(email = "creator@example.com") {
  const response = await post("sign-up/email", { email, password, name: "Creator" });
  expect(response.status, await response.clone().text()).toBe(200);
  return response;
}
function code() {
  const otp = messages.at(-1)?.text.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  return otp!;
}
async function signIn(email = "creator@example.com") {
  const response = await post("sign-in/email", { email, password });
  expect(response.status, await response.clone().text()).toBe(200);
  const cookies = response.headers.getSetCookie();
  return { response, cookie: cookies.map((entry) => entry.split(";")[0]).join("; ") };
}

test("register, verify, sign in, restore a session, and revoke it on sign-out", async () => {
  expect((await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`)).status).toBe(401);
  const signup = await signUp();
  expect(((await signup.json()) as { token: null }).token).toBeNull();
  expect((await post("sign-in/email", { email: "creator@example.com", password })).status).toBe(
    403,
  );
  expect(messages).toHaveLength(1);
  expect(messages[0].to).toEqual(["creator@example.com"]);
  const otp = code();
  const storedOTP = await createDb(env.DB).select().from(verification).get();
  expect(storedOTP?.value).not.toContain(otp);
  const account = await env.DB.prepare("SELECT password FROM accounts").first<{
    password: string;
  }>();
  expect(account?.password).toBeTruthy();
  expect(account?.password).not.toBe(password);
  expect((await post("email-otp/verify-email", { email: "creator@example.com", otp })).status).toBe(
    200,
  );
  // Verification proves ownership but does not create a passwordless session.
  expect((await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`)).status).toBe(401);
  const { response, cookie } = await signIn();
  const cookieHeader = response.headers.getSetCookie().join(";");
  expect(cookieHeader).toContain("HttpOnly");
  expect(cookieHeader).toContain("Secure");
  expect(cookieHeader.toLowerCase()).toContain("samesite=lax");
  expect(cookieHeader.toLowerCase()).not.toContain("domain=");
  const me = await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, {
    headers: { Cookie: cookie },
  });
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ user: { email: "creator@example.com" } });
  const restored = await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  });
  expect(await restored.json()).toMatchObject({
    user: { email: "creator@example.com", emailVerified: true },
  });
  expect(restored.headers.get("Cache-Control")).toBe("no-store");
  expect((await post("sign-out", {}, cookie)).status).toBe(200);
  expect(
    (await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, { headers: { Cookie: cookie } }))
      .status,
  ).toBe(401);
});

test("protected APIs renew the browser cookie alongside the database session", async () => {
  await signUp();
  await post("email-otp/verify-email", { email: "creator@example.com", otp: code() });
  const { cookie } = await signIn();
  const oldExpiry = new Date(Date.now() + 60_000);
  await createDb(env.DB).update(session).set({ expiresAt: oldExpiry });

  const response: Response = await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, {
    headers: { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  const stored = await createDb(env.DB).select().from(session).get();
  expect(stored!.expiresAt.getTime()).toBeGreaterThan(oldExpiry.getTime());
  const renewedCookies = response.headers.getSetCookie();
  const sessionCookie = renewedCookies.find((entry) =>
    entry.startsWith(`${cookie.split("=")[0]}=`),
  );
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie).toMatch(/Max-Age=604800/i);
  expect(sessionCookie).toContain("HttpOnly");
  expect(sessionCookie).toContain("Secure");
  const restored = await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, {
    headers: { Cookie: renewedCookies.map((entry) => entry.split(";")[0]).join("; ") },
  });
  expect(restored.status).toBe(200);
});

test("protected APIs clear expired session cookies on unauthorized responses", async () => {
  await signUp();
  await post("email-otp/verify-email", { email: "creator@example.com", otp: code() });
  const { cookie } = await signIn();
  await createDb(env.DB)
    .update(session)
    .set({ expiresAt: new Date(0) });

  const response: Response = await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, {
    headers: { Cookie: cookie },
  });
  expect(response.status).toBe(401);
  const clearedCookie = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${cookie.split("=")[0]}=`));
  expect(clearedCookie).toBeDefined();
  expect(clearedCookie).toMatch(/Max-Age=0/i);
});

test("expired and tampered sessions cannot access protected APIs", async () => {
  await signUp();
  await post("email-otp/verify-email", { email: "creator@example.com", otp: code() });
  const { cookie } = await signIn();
  await createDb(env.DB)
    .update(session)
    .set({ expiresAt: new Date(0) });
  for (const token of [cookie, `${cookie}tampered`]) {
    expect(
      (await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, { headers: { Cookie: token } }))
        .status,
    ).toBe(401);
  }
});

test("OTP attempts, expiry, and replay are enforced", async () => {
  await signUp();
  const otp = code();
  const wrong = otp === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(
      (await post("email-otp/verify-email", { email: "creator@example.com", otp: wrong })).ok,
    ).toBe(false);
  }
  expect((await post("email-otp/verify-email", { email: "creator@example.com", otp })).ok).toBe(
    false,
  );
  await post("email-otp/send-verification-otp", {
    email: "creator@example.com",
    type: "email-verification",
  });
  const expired = code();
  await createDb(env.DB)
    .update(verification)
    .set({ expiresAt: new Date(0) });
  expect(
    (await post("email-otp/verify-email", { email: "creator@example.com", otp: expired })).ok,
  ).toBe(false);
  await post("email-otp/send-verification-otp", {
    email: "creator@example.com",
    type: "email-verification",
  });
  const fresh = code();
  expect(
    (await post("email-otp/verify-email", { email: "creator@example.com", otp: fresh })).ok,
  ).toBe(true);
  expect(
    (await post("email-otp/verify-email", { email: "creator@example.com", otp: fresh })).ok,
  ).toBe(false);
});

test("duplicate registration and unknown-email resend do not reveal account existence", async () => {
  await signUp();
  const duplicate = await signUp();
  expect(await duplicate.json()).toMatchObject({ token: null, user: { emailVerified: false } });
  const known = await post("email-otp/send-verification-otp", {
    email: "creator@example.com",
    type: "email-verification",
  });
  const unknown = await post("email-otp/send-verification-otp", {
    email: "unknown@example.com",
    type: "email-verification",
  });
  expect(known.status).toBe(unknown.status);
  expect(await known.json()).toEqual(await unknown.json());
  const invalid = await post("sign-in/email", {
    email: "creator@example.com",
    password: "wrong-password",
  });
  const absent = await post("sign-in/email", {
    email: "unknown@example.com",
    password: "wrong-password",
  });
  expect(invalid.status).toBe(absent.status);
  const invalidBody = (await invalid.json()) as { error: { requestId?: string } };
  const absentBody = (await absent.json()) as { error: { requestId?: string } };
  expect(invalidBody.error.requestId).toBeTruthy();
  expect(absentBody.error.requestId).toBeTruthy();
  delete invalidBody.error.requestId;
  delete absentBody.error.requestId;
  expect(invalidBody).toEqual(absentBody);
});

test("cross-origin requests and deferred authentication methods are rejected", async () => {
  expect(
    (
      await post(
        "sign-up/email",
        { email: "creator@example.com", password, name: "Creator" },
        "",
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  expect((await post("sign-out", {}, "", "")).status).toBe(403);
  expect(
    (await post("sign-in/email-otp", { email: "creator@example.com", otp: "123456" })).status,
  ).toBe(404);
  expect(
    (
      await post("email-otp/send-verification-otp", {
        email: "creator@example.com",
        type: "sign-in",
      })
    ).status,
  ).toBe(400);
  expect(messages).toHaveLength(0);
});

test("issuance is limited by normalized email even across different IPs", async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await post(
      "email-otp/send-verification-otp",
      {
        email: attempt % 2 ? "LIMIT@example.com" : "limit@example.com",
        type: "email-verification",
      },
      "",
      env.BETTER_AUTH_URL,
      `192.0.2.${attempt + 1}`,
    );
    expect(result.status).toBe(attempt < 3 ? 200 : 429);
  }
});

test("parallel requests cannot exceed a D1 rate limit, and expired limits reset", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => consumeAuthLimit(env, "concurrent", 3, 60)),
  );
  expect(results.filter(Boolean)).toHaveLength(3);
  await createDb(env.DB).update(authRateLimits).set({ expiresAt: 0 });
  expect(await consumeAuthLimit(env, "concurrent", 3, 60)).toBe(true);
});

test("short passwords are rejected without creating a user", async () => {
  expect(
    (
      await post("sign-up/email", {
        email: "short@example.com",
        password: "short",
        name: "Creator",
      })
    ).ok,
  ).toBe(false);
  expect(
    await createDb(env.DB).select().from(user).where(eq(user.email, "short@example.com")),
  ).toHaveLength(0);
});

test("IP throttling applies across different accounts", async () => {
  for (let attempt = 0; attempt < 31; attempt++) {
    const response = await post("sign-out", {});
    expect(response.status).toBe(attempt < 30 ? 200 : 429);
    if (attempt === 30) expect(response.headers.get("Retry-After")).toBe("60");
  }
});

test("verification is checked even for an otherwise valid session", async () => {
  await signUp();
  await post("email-otp/verify-email", { email: "creator@example.com", otp: code() });
  const { cookie } = await signIn();
  await createDb(env.DB).update(user).set({ emailVerified: false });
  const response = await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, {
    headers: { Cookie: cookie },
  });
  expect(response.status).toBe(401);
});

function resetToken() {
  const link = messages.at(-1)?.text.match(/https:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();
  const url = new URL(link!);
  expect(url.origin).toBe(env.BETTER_AUTH_URL);
  expect(url.pathname).toBe("/reset-password");
  expect(url.search).toBe("");
  return new URLSearchParams(url.hash.slice(1)).get("token")!;
}

test("password recovery hides account existence and revokes sessions after a single-use reset", async () => {
  const email = "creator@example.com";
  await signUp();
  await post("email-otp/verify-email", { email, otp: code() });
  const { cookie } = await signIn();
  const known = await post("request-password-reset", { email });
  expect(known.status).toBe(200);
  const token = resetToken();
  const count = messages.length;
  const unknown = await post("request-password-reset", { email: "unknown@example.com" });
  expect(unknown.status).toBe(200);
  expect(await unknown.json()).toEqual(await known.json());
  expect(messages).toHaveLength(count);
  expect((await post("reset-password", { token, newPassword: "short" })).status).toBe(400);
  expect((await post("reset-password", { token, newPassword: "a".repeat(129) })).status).toBe(400);
  const newPassword = "a-different-password-456";
  const attempts = await Promise.all([
    post("reset-password", { token, newPassword }),
    post("reset-password", { token, newPassword }),
  ]);
  expect(attempts.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 400]);
  expect((await post("reset-password", { token, newPassword })).status).toBe(400);
  expect(
    (await exports.default.fetch(`${env.BETTER_AUTH_URL}/api/me`, { headers: { Cookie: cookie } }))
      .status,
  ).toBe(401);
  expect((await post("sign-in/email", { email, password })).status).toBe(401);
  expect((await post("sign-in/email", { email, password: newPassword })).status).toBe(200);
});

test("reset tokens expire, require the app origin, and do not verify email", async () => {
  const email = "creator@example.com";
  await signUp();
  await post("request-password-reset", { email });
  const token = resetToken();
  expect(
    (
      await post(
        "reset-password",
        { token, newPassword: password },
        "",
        "https://other.example.com",
      )
    ).status,
  ).toBe(403);
  await createDb(env.DB)
    .update(verification)
    .set({ expiresAt: new Date(Date.now() - 1000) });
  expect((await post("reset-password", { token, newPassword: password })).status).toBe(400);
  expect((await post("reset-password", { token: "invalid", newPassword: password })).status).toBe(
    400,
  );
  await post("request-password-reset", { email });
  expect(
    (await post("reset-password", { token: resetToken(), newPassword: password })).status,
  ).toBe(200);
  expect((await post("sign-in/email", { email, password })).status).toBe(403);
});

test("recovery requests are limited by normalized email and reset attempts by IP", async () => {
  for (let i = 0; i < 3; i++) {
    expect(
      (
        await post(
          "request-password-reset",
          { email: "Unknown@example.com" },
          "",
          env.BETTER_AUTH_URL,
          `192.0.2.${i + 10}`,
        )
      ).status,
    ).toBe(200);
  }
  expect(
    (
      await post(
        "request-password-reset",
        { email: "unknown@example.com" },
        "",
        env.BETTER_AUTH_URL,
        "192.0.2.20",
      )
    ).status,
  ).toBe(429);
  expect(
    (
      await post(
        "request-password-reset",
        { email: "other@example.com" },
        "",
        "https://other.example.com",
      )
    ).status,
  ).toBe(403);
  for (let i = 0; i < 30; i++) {
    expect(
      (
        await post(
          "reset-password",
          { token: "invalid", newPassword: password },
          "",
          env.BETTER_AUTH_URL,
          "192.0.2.99",
        )
      ).status,
    ).toBe(400);
  }
  expect(
    (
      await post(
        "reset-password",
        { token: "invalid", newPassword: password },
        "",
        env.BETTER_AUTH_URL,
        "192.0.2.99",
      )
    ).status,
  ).toBe(429);
});
