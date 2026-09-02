import reactLogo from "@/assets/react.svg";
import { ModeToggle } from "@/components/mode-toggle";

export function App() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="flex flex-col items-center gap-5 text-center">
        <img src={reactLogo} className="size-16" alt="React logo" />
        <div className="space-y-1">
          <h1 className="text-lg font-medium">Ready to build.</h1>
          <p className="text-sm text-muted-foreground">
            Edit <code className="font-mono text-foreground">src/App.tsx</code> to get started.
          </p>
        </div>
      </div>
    </main>
  );
}

export default App;
