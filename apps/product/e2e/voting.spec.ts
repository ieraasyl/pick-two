import { expect, test } from "@playwright/test";
import type { BallotState } from "../shared/contracts/voting.js";

const token = "a".repeat(48);
const optionIds = [
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
  "40000000-0000-4000-8000-000000000004",
];
const labels = ["Orbit", "Kite", "Juniper", "Northstar"];

test("anonymous voting resumes after reload and a lost response, then completes", async ({
  page,
}) => {
  let started = false;
  let completed = 0;
  let lostResponse = false;
  const pairs = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];
  const state = (): BallotState => ({
    question: "Choose a name",
    state: !started ? "ready" : completed === 6 ? "complete" : "voting",
    completed,
    total: 6,
    comparison:
      started && completed < 6
        ? {
            id: `50000000-0000-4000-8000-00000000000${completed}`,
            choices: pairs[completed].map((i) => ({ id: optionIds[i], label: labels[i] })) as [
              { id: string; label: string },
              { id: string; label: string },
            ],
          }
        : null,
  });
  await page.route("**/api/auth/**", () => {
    throw new Error("Public voting must not request a creator session");
  });
  await page.route("**/api/voting/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/ballot")) started = true;
    if (path.endsWith("/votes")) {
      const body = route.request().postDataJSON();
      expect(body.comparisonId).toBe(state().comparison!.id);
      expect(state().comparison!.choices.map((option) => option.id)).toContain(body.winnerId);
      completed++;
      if (!lostResponse) {
        lostResponse = true;
        return route.abort("failed");
      }
    }
    return route.fulfill({ json: state() });
  });
  await page.goto(`/r/${token}`);
  await expect(page.getByText(/6 comparisons, no account needed/)).toBeVisible();
  await page.getByRole("button", { name: "Start voting" }).click();
  await expect(page.getByRole("progressbar", { name: "Ballot progress" })).toHaveAttribute(
    "value",
    "0",
  );
  await page.getByRole("region", { name: "Pairwise voting" }).getByRole("button").first().click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
  await page.reload();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
  for (let i = 1; i < 6; i++) {
    await page.getByRole("region", { name: "Pairwise voting" }).getByRole("button").first().click();
    if (i < 5) await expect(page.getByRole("progressbar")).toHaveAttribute("value", String(i + 1));
  }
  await expect(page.getByRole("heading", { name: "You’re all done!" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("All 6 comparisons are saved.", { exact: false })).toBeVisible();
  expect(completed).toBe(6);
});

test("closed and invalid voting links do not offer voting controls", async ({ page }) => {
  await page.route("**/api/voting/**", (route) =>
    route.fulfill({
      json: {
        question: "Choose a name",
        state: "closed",
        total: 6,
        completed: 0,
        comparison: null,
      },
    }),
  );
  await page.goto(`/r/${token}`);
  await expect(page.getByRole("heading", { name: "Voting is closed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start voting" })).toHaveCount(0);
  await page.route("**/api/voting/**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "This voting link is unavailable." } },
    }),
  );
  await page.goto("/r/invalid");
  await expect(page.getByRole("alert")).toContainText("This voting link is unavailable.");
});
