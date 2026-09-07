export type VerificationEmail = { email: string; otp: string };

export async function sendVerificationEmail(env: Env, { email, otp }: VerificationEmail) {
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
      subject: "Verify your Pick Two email",
      text: `Your Pick Two verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
    }),
  });
  if (!response.ok) throw new Error("Email delivery failed");
}
