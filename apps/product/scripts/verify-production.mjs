import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function verifyProductionSender(config) {
  assert.equal(config.vars?.APP_ENV, "production", "Build the production environment first");
  const sender = config.vars.AUTH_EMAIL_FROM ?? "";
  const email = (sender.match(/<([^<>]+)>$/)?.[1] ?? sender).trim();
  assert.match(email, /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/, "Configure a production sender address");
  assert.ok(
    !/(?:@|\.)resend\.dev$/i.test(email),
    "Replace the Resend testing sender with an address on a verified domain before releasing",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyProductionSender(JSON.parse(await readFile(process.argv[2], "utf8")));
}
