import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStagingRun } from "./verify-staging.mjs";

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
