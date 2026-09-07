// Increment and check in one D1 statement so parallel requests cannot bypass the limit.
export async function consumeAuthLimit(
  env: Env,
  identity: string,
  max: number,
  windowSeconds: number,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${identity}`),
  );
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  const now = Date.now();
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE expires_at <= ?").bind(now).run();
  const row = await env.DB.prepare(`
    INSERT INTO auth_rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1
    RETURNING count
  `)
    .bind(key, now + windowSeconds * 1000)
    .first<{ count: number }>();
  return !!row && row.count <= max;
}
