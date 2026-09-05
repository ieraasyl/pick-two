import { createFileRoute } from "@tanstack/react-router";

import { CreatorShell } from "@/app/creator-shell";

export const Route = createFileRoute("/_creator")({
  component: CreatorShell,
});
