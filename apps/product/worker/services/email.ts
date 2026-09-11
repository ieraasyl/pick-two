export type VerificationEmail = { email: string; otp: string };

export async function sendVerificationEmail(env: Env, { email, otp }: VerificationEmail) {
  return sendEmail(
    env,
    email,
    "Verify your Pick Two email",
    `Your Pick Two verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
  );
}

export function sendPasswordResetEmail(env: Env, email: string, token: string) {
  const url = new URL("/reset-password", env.BETTER_AUTH_URL);
  url.hash = new URLSearchParams({ token }).toString();
  return sendEmail(
    env,
    email,
    "Reset your Pick Two password",
    `Reset your password using this link:\n${url.href}\nThis link expires in 15 minutes and can be used once. If you did not request it, you can ignore this email.`,
  );
}

async function sendEmail(env: Env, email: string, subject: string, text: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [email],
      subject,
      text,
    }),
  });
  if (!response.ok) throw new Error("Email delivery failed");
}
