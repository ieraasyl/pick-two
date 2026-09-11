import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStagingRun, verifyProductionApproval } from "./verify-staging.mjs";

const run = {
  repository: { full_name: "owner/repo" },
  path: ".github/workflows/ci.yml",
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  head_sha: "a".repeat(40),
};
const jobs = ["validate", "staging"].map((name) => ({ name, conclusion: "success" }));

await test("releases the exact commit that passed staging", () => {
  assert.equal(verifyStagingRun(run, jobs, "owner/repo"), run.head_sha);
});

await test("rejects runs that did not validate and deploy main from this repository", () => {
  for (const change of [
    { repository: { full_name: "other/repo" } },
    { path: ".github/workflows/other.yml" },
    { head_branch: "feature" },
    { event: "pull_request" },
    { status: "in_progress" },
    { conclusion: "failure" },
    { head_sha: "main" },
  ]) {
    assert.throws(() => verifyStagingRun({ ...run, ...change }, jobs, "owner/repo"));
  }
  for (const name of ["validate", "staging"]) {
    assert.throws(() =>
      verifyStagingRun(
        run,
        jobs.filter((job) => job.name !== name),
        "owner/repo",
      ),
    );
    assert.throws(() =>
      verifyStagingRun(
        run,
        jobs.map((job) => (job.name === name ? { ...job, conclusion: "skipped" } : job)),
        "owner/repo",
      ),
    );
  }
});

await test("production requires a reviewer rule with at least one reviewer", () => {
  for (const protection_rules of [
    [],
    [{ type: "branch_policy" }],
    [{ type: "required_reviewers", reviewers: [] }],
  ]) {
    assert.throws(() => verifyProductionApproval({ protection_rules }));
  }
  verifyProductionApproval({
    protection_rules: [
      { type: "required_reviewers", reviewers: [{ type: "User", reviewer: { id: 1 } }] },
    ],
  });
});

await test("production rejects the testing sender and missing configuration", async () => {
  const { verifyProductionSender } = await import("./verify-production.mjs");
  const config = (sender) => ({ vars: { APP_ENV: "production", AUTH_EMAIL_FROM: sender } });
  for (const sender of [
    "",
    "invalid",
    "onboarding@resend.dev",
    "Pick Two <onboarding@RESEND.DEV>",
  ]) {
    assert.throws(() => verifyProductionSender(config(sender)));
  }
  assert.throws(() => verifyProductionSender({ vars: { APP_ENV: "staging" } }));
  verifyProductionSender(config("Pick Two <auth@example.com>"));
});
