import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPassword });

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setSent(false);
    try {
      const result = await authClient.requestPasswordReset({ email: email.trim().toLowerCase() });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many requests. Wait five minutes and try again."
            : "Unable to send a reset link. Please try again.",
        );
      } else setSent(true);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-md space-y-6 px-5 py-16">
      <h1 className="text-3xl font-semibold">Forgot your password?</h1>
      <p>Enter your email to request a password reset link.</p>
      <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {sent && (
          <p role="status">
            If an account exists for this email, a reset link is on its way. The link expires in 15
            minutes.
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link to="/sign-in" className="inline-block text-sm underline">
        Back to sign in
      </Link>
    </main>
  );
}
