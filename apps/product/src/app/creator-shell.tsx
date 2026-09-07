import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

export function CreatorShell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && !sessionError && (!session || !session.user.emailVerified)) {
      queryClient.clear();
      void router.navigate({ to: "/sign-in", replace: true });
    }
  }, [session, isPending, sessionError, queryClient, router]);

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign-out failed");
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/sign-in", replace: true });
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  if (isPending)
    return (
      <p role="status" className="p-8">
        Loading your workspace…
      </p>
    );
  if (sessionError)
    return (
      <div className="p-8">
        <p role="alert">Unable to check your session.</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  if (!session?.user.emailVerified) return null;

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-50 -translate-y-[calc(100%+1rem)] rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Skip to content
      </a>
      <aside className="border-b bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-svh md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-5 md:px-6 md:py-8">
          <Link
            to="/dashboard"
            className="rounded-sm text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
          >
            Pick Two<span className="text-primary">.</span>
          </Link>
          <ModeToggle />
        </div>
        <nav aria-label="Workspace" className="px-3 pb-3 md:px-4">
          <Link
            to="/dashboard"
            activeOptions={{ exact: true }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
            activeProps={{
              className: "bg-sidebar-accent text-sidebar-accent-foreground",
              "aria-current": "page",
            }}
          >
            <SquaresFourIcon size={20} aria-hidden="true" />
            Dashboard
          </Link>
        </nav>
        <div className="space-y-2 px-6 py-4">
          <p className="truncate text-sm text-muted-foreground" title={session.user.email}>
            {session.user.email}
          </p>
          <Button variant="outline" disabled={signingOut} onClick={signOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </aside>
      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 px-5 py-8 outline-none sm:px-8 md:px-12 md:py-12"
      >
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
