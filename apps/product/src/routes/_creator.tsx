import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSession } from "@/lib/auth-client";

import { CreatorShell } from "@/app/creator-shell";

export const Route = createFileRoute("/_creator")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/sign-in", replace: true });
    return { session };
  },
  component: CreatorShell,
});
