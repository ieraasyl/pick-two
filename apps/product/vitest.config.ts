import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
      miniflare: {
        bindings: {
          BETTER_AUTH_URL: "https://app.example.com",
          BETTER_AUTH_SECRET: "test-only-secret-32-characters-minimum-never-deploy",
          RESEND_API_KEY: "test-only-resend-key",
          AUTH_EMAIL_FROM: "Pick Two <verify@example.com>",
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL("./drizzle", import.meta.url)),
          ),
        },
      },
    })),
  ],
});
