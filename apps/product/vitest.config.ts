import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
});
