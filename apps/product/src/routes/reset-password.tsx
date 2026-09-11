import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function readToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

function subscribeToToken(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function ResetPassword() {
  const token = useSyncExternalStore(subscribeToToken, readToken);
  return <ResetPasswordForm key={token} token={token} />;
}

function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      // A response for an older link must not change the new form or URL.
      if (readToken() !== token) return;
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Unable to reset your password. The link may have expired or already been used. Request a new link below.",
        );
        return;
      }
      client.clear();
      setPassword("");
      setConfirmation("");
      window.history.replaceState(window.history.state, "", window.location.pathname);
      setDone(true);
    } catch {
      setError(
        "Unable to connect. Try again. If the link was already used, sign in with your new password or request another link.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-md space-y-6 px-5 py-16">
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      {done ? (
        <p role="status">
          Your password has been reset. Sign in with your new password. All previous sessions have
          been signed out.
        </p>
      ) : !token ? (
        <p role="alert">This reset link is missing a token. Request a new link.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
          <p id="password-help">Use 12–128 characters.</p>
          <fieldset disabled={pending} className="space-y-4">
            <label className="block text-sm font-medium">
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                aria-describedby="password-help"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
              />
            </label>
            <label className="block text-sm font-medium">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <Button type="submit">{pending ? "Saving…" : "Reset password"}</Button>
          </fieldset>
        </form>
      )}
      {!done && (
        <Link to="/forgot-password" className="block text-sm underline">
          Request a new reset link
        </Link>
      )}
      <Link to="/sign-in" className="inline-block text-sm underline">
        Back to sign in
      </Link>
    </main>
  );
}
