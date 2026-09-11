import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function verifyStagingRun(run, jobs, repository) {
  assert.equal(run.repository.full_name, repository, "Run belongs to another repository");
  assert.equal(run.path, ".github/workflows/ci.yml", "Select the staging CI workflow");
  assert.equal(run.head_branch, "main", "Only main can be released");
  assert.ok(["push", "workflow_dispatch"].includes(run.event), "PR runs cannot be released");
  assert.equal(run.status, "completed", "Staging is still running");
  assert.equal(run.conclusion, "success", "Staging checks must pass");
  assert.match(run.head_sha, /^[a-f0-9]{40}$/, "Invalid commit SHA");
  for (const name of ["validate", "staging"]) {
    assert.ok(
      jobs.some((job) => job.name === name && job.conclusion === "success"),
      `${name} must have succeeded`,
    );
  }
  return run.head_sha;
}

export function verifyProductionApproval(environment) {
  assert.ok(
    environment.protection_rules?.some(
      (rule) => rule.type === "required_reviewers" && rule.reviewers?.length > 0,
    ),
    "Configure required reviewers on the production GitHub environment before releasing",
  );
}

async function main() {
  const { GH_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT, STAGING_RUN_ID } = process.env;
  assert.ok(GH_TOKEN && GITHUB_REPOSITORY && GITHUB_OUTPUT, "Run this inside GitHub Actions");
  assert.match(STAGING_RUN_ID ?? "", /^[1-9][0-9]*$/, "Enter a staging workflow run ID");
  async function get(path) {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/${path}`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000),
    });
    assert.ok(response.ok, `GitHub request failed: HTTP ${response.status}`);
    return response.json();
  }
  verifyProductionApproval(await get("environments/production"));
  const run = await get(`actions/runs/${STAGING_RUN_ID}`);
  const jobs = await get(
    `actions/runs/${STAGING_RUN_ID}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  const sha = verifyStagingRun(run, jobs.jobs, GITHUB_REPOSITORY);
  await appendFile(GITHUB_OUTPUT, `sha=${sha}\n`);
  console.log(`Verified staging commit ${sha}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
