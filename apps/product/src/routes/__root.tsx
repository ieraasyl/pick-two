import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "../components/theme-provider.tsx";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  pendingComponent: () => (
    <p role="status" className="p-8">
      Loading…
    </p>
  ),
  errorComponent: () => (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Unable to load this page</h1>
      <p className="my-3">Please check your connection and try again.</p>
      <button onClick={() => window.location.reload()} className="underline">
        Try again
      </button>
    </div>
  ),
  component: RootComponent,
});

export function RootComponent() {
  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
