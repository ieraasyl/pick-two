import { createMiddleware } from "hono/factory";
import { createAuth, type AuthSession } from "../auth.js";

export type AuthEnvironment = { Bindings: Env; Variables: { authSession: AuthSession } };

export const requireSession = createMiddleware<AuthEnvironment>(async (context, next) => {
  context.header("Cache-Control", "no-store");
  const { response: session, headers } = await createAuth(context.env).api.getSession({
    headers: context.req.raw.headers,
    returnHeaders: true,
  });
  // Forward both renewed cookies and expired-session cookie deletions.
  for (const cookie of headers.getSetCookie()) {
    context.header("Set-Cookie", cookie, { append: true });
  }
  if (!session || !session.user.emailVerified) {
    return context.json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue" } }, 401);
  }
  context.set("authSession", session);
  await next();
});
