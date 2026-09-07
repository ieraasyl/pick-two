import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [emailOTPClient()] });

export async function getSession() {
  const { data, error } = await authClient.getSession({ fetchOptions: { cache: "no-store" } });
  if (error) throw new Error("Unable to check your session. Please try again.");
  return data?.user.emailVerified ? data : null;
}
