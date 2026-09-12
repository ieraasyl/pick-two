import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { authClient, getSession } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: "/dashboard" });
  },
  component: SignIn,
});

function SignIn() {
  const router = useRouter();
  const { error: oauthError } = Route.useSearch();
  const { queryClient } = Route.useRouteContext();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "verify">("sign-in");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    oauthError
      ? oauthError === "account_not_linked"
        ? "Verify your existing Pick Two email before using Google sign-in, or sign in with your password."
        : "Google sign-in did not finish. Try again or sign in with your email and password."
      : "",
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    function restorePage(event: PageTransitionEvent) {
      // Back from Google can restore this component with its redirect still pending.
      if (event.persisted) setPending(false);
    }
    window.addEventListener("pageshow", restorePage);
    return () => window.removeEventListener("pageshow", restorePage);
  }, []);

  function switchMode(next: typeof mode) {
    setMode(next);
    setPassword("");
    setOtp("");
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);
    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          email: normalizedEmail,
          password,
          name: name.trim(),
        });
        if (result.error) {
          setError(
            result.error.status === 429
              ? "Too many attempts. Please wait five minutes."
              : "Unable to create your account. Check your details and try again.",
          );
          return;
        }
        switchMode("verify");
        setNotice(
          "If this address is eligible, a verification code is on its way. Already registered? Sign in instead.",
        );
      } else if (mode === "verify") {
        const result = await authClient.emailOtp.verifyEmail({ email: normalizedEmail, otp });
        if (result.error) {
          setError(
            "That code is invalid, expired, or has too many attempts. Request a new code and try again.",
          );
          return;
        }
        switchMode("sign-in");
        setNotice("Email verified. Sign in with your password to continue.");
      } else {
        const result = await authClient.signIn.email({ email: normalizedEmail, password });
        if (result.error) {
          if (result.error.code === "EMAIL_NOT_VERIFIED") {
            switchMode("verify");
            setNotice("Verify your email before signing in. Enter your code or request a new one.");
          } else {
            setError(
              result.error.status === 429
                ? "Too many attempts. Please wait a minute."
                : "Unable to sign in. Check your email and password.",
            );
          }
          return;
        }
        setPassword("");
        queryClient.clear();
        await router.invalidate();
        await router.navigate({ to: "/dashboard", replace: true });
      }
    } catch {
      setError("We couldn’t connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
        errorCallbackURL: "/sign-in",
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Please wait a minute."
            : "Google sign-in is unavailable. Try again or use email and password.",
        );
        setPending(false);
      }
    } catch {
      setError("Unable to connect to Google sign-in. Please try again.");
      setPending(false);
    }
  }

  async function resend() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "email-verification",
      });
      if (result.error)
        setError(
          "Unable to send a code. Check your email address or wait five minutes before trying again.",
        );
      else
        setNotice(
          "If this address is eligible, a new code is on its way. Use the most recent code.",
        );
    } catch {
      setError("We couldn’t connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "mt-2 h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50";
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between p-6 sm:px-10">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          Pick Two<span className="text-primary">.</span>
        </Link>
        <ModeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <section
          aria-labelledby="auth-heading"
          className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
        >
          <h1 id="auth-heading" className="text-2xl font-semibold tracking-tight">
            {mode === "sign-up"
              ? "Create your account"
              : mode === "verify"
                ? "Verify your email"
                : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "verify"
              ? "Enter the six-digit code from your email. Codes expire after five minutes."
              : "Create rankings. Share choices. Decide together."}
          </p>
          {mode !== "verify" && (
            <Button
              type="button"
              variant="outline"
              className="mt-6 h-11 w-full"
              disabled={pending}
              onClick={signInWithGoogle}
            >
              Continue with Google
            </Button>
          )}
          <form onSubmit={submit} className="mt-8 space-y-5" aria-busy={pending}>
            <fieldset disabled={pending} className="space-y-5">
              {mode === "sign-up" && (
                <label className="block text-sm font-medium" htmlFor="name">
                  Name
                  <input
                    id="name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
              <label className="block text-sm font-medium" htmlFor="email">
                Email
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                />
              </label>
              {mode === "verify" ? (
                <label className="block text-sm font-medium" htmlFor="otp">
                  Verification code
                  <input
                    id="otp"
                    name="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    className={inputClass}
                  />
                </label>
              ) : (
                <div className="block text-sm font-medium">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                    minLength={mode === "sign-up" ? 12 : undefined}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={mode === "sign-up" ? "password-help" : undefined}
                    className={inputClass}
                  />
                  {mode === "sign-up" && (
                    <span id="password-help" className="mt-2 block text-xs text-muted-foreground">
                      Use at least 12 characters.
                    </span>
                  )}
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              )}
              <Button type="submit" className="h-11 w-full">
                {pending
                  ? "Please wait…"
                  : mode === "sign-up"
                    ? "Create account"
                    : mode === "verify"
                      ? "Verify email"
                      : "Sign in"}
              </Button>
            </fieldset>
          </form>
          {mode === "sign-in" && (
            <Link to="/forgot-password" className="mt-4 block text-center text-sm underline">
              Forgot password?
            </Link>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
            {mode === "verify" && (
              <Button variant="link" disabled={pending || !email} onClick={resend}>
                Send a new code
              </Button>
            )}
            <Button
              variant="link"
              disabled={pending}
              onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            >
              {mode === "sign-in" ? "Create an account" : "Back to sign in"}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
