import { exports } from "cloudflare:workers";
import { expect, test } from "vite-plus/test";

test("GET /api/health reports availability", async () => {
  const response = await exports.default.fetch("https://example.com/api/health");

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
