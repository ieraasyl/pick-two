import { test as base } from "@playwright/test";
import { Miniflare, Response } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const test = base.extend<{
  app: { origin: string; messages: { to: string[]; text: string }[] };
}>({
  // Playwright requires a destructured fixture argument even without dependencies.
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, provide, info) => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const config = JSON.parse(await readFile(`${root}dist/pick_two_product/wrangler.json`, "utf8"));
    const origin = `http://127.0.0.1:${5180 + info.parallelIndex}`;
    const messages: { to: string[]; text: string }[] = [];
    const bundleRoot = `${root}dist/pick_two_product`;
    const modules = Object.fromEntries(
      await Promise.all(
        (await readdir(bundleRoot, { recursive: true }))
          .filter((path) => path.endsWith(".js"))
          .map(async (path) => [
            path,
            { type: "esm" as const, contents: await readFile(`${bundleRoot}/${path}`, "utf8") },
          ]),
      ),
    );
    const runtime = new Miniflare({
      host: "127.0.0.1",
      port: 5180 + info.parallelIndex,
      workers: [
        {
          config: {
            name: "journey",
            type: "worker",
            compatibilityDate: config.compatibility_date,
            compatibilityFlags: config.compatibility_flags,
            manifest: { mainModule: "index.js", modulesRoot: bundleRoot, modules },
            env: {
              APP_ENV: { type: "text", value: "test" },
              BETTER_AUTH_URL: { type: "text", value: origin },
              BETTER_AUTH_SECRET: {
                type: "text",
                value: "journey-only-secret-at-least-32-characters",
              },
              RESEND_API_KEY: { type: "text", value: "journey-only-email-key" },
              AUTH_EMAIL_FROM: { type: "text", value: "Pick Two <verify@example.com>" },
              DB: { type: "d1", id: "journey" },
            },
            assets: {
              directory: `${root}dist/client`,
              hasUserWorker: true,
              runWorkerFirst: config.assets.run_worker_first,
              notFoundHandling: config.assets.not_found_handling,
            },
          },
          dev: {
            outboundService: {
              type: "fetcher",
              handler: async (request) => {
                if (request.url !== "https://api.resend.com/emails" || request.method !== "POST")
                  throw new Error(`Unexpected outbound request: ${request.url}`);
                messages.push((await request.json()) as { to: string[]; text: string });
                return new Response(JSON.stringify({ id: crypto.randomUUID() }), {
                  headers: { "Content-Type": "application/json" },
                });
              },
            },
          },
        },
      ],
    });
    try {
      await runtime.ready;
      const db = await runtime.getD1Database("DB");
      const journal = JSON.parse(await readFile(`${root}drizzle/meta/_journal.json`, "utf8"));
      for (const entry of journal.entries) {
        const sql = await readFile(`${root}drizzle/${entry.tag}.sql`, "utf8");
        await db.batch(
          sql
            .split("--> statement-breakpoint")
            .filter((s) => s.trim())
            .map((s) => db.prepare(s)),
        );
      }
      await provide({ origin, messages });
    } finally {
      await runtime.dispose();
    }
  },
});
export { expect } from "@playwright/test";
