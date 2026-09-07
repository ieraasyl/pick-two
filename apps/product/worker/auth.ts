import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { createDb } from "./db/client.js";
import * as schema from "./db/auth-schema.js";
import { sendVerificationEmail } from "./services/email.js";

export function createAuth(env: Env, executionContext?: Pick<ExecutionContext, "waitUntil">) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  const origin = new URL(env.BETTER_AUTH_URL);
  const local = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if (origin.origin !== env.BETTER_AUTH_URL || (!local && origin.protocol !== "https:")) {
    throw new Error("BETTER_AUTH_URL must be an HTTPS origin (HTTP is allowed on localhost)");
  }

  return betterAuth({
    appName: "Pick Two",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(env.DB), { provider: "sqlite", schema, transaction: false }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { enabled: false } },
    // Atomic D1 limits at the HTTP boundary work across Worker isolates.
    rateLimit: { enabled: false },
    logger: { disabled: true },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: !local,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        disableSignUp: true,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "email-verification") throw new Error("Unsupported email type");
          const delivery = sendVerificationEmail(env, { email, otp }).catch(() => {
            // Never log provider responses, email addresses, codes, or credentials.
            console.error(JSON.stringify({ code: "AUTH_EMAIL_DELIVERY_FAILED" }));
          });
          if (executionContext) executionContext.waitUntil(delivery);
          else await delivery;
        },
      }),
    ],
  });
}

export type AuthSession = ReturnType<typeof createAuth>["$Infer"]["Session"];
