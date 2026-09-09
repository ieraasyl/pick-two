import { expect, test } from "@playwright/test";
test("public results show rankings and recover when visibility changes", async ({ page }) => {
  let visible = false;
  await page.route("**/api/voting/*/results", (route) =>
    visible
      ? route.fulfill({
          json: {
            question: "Choose a name",
            status: "closed",
            ballots: 3,
            completedBallots: 2,
            comparisons: 14,
            ranking: [
              { id: "a", label: "Orbit", rank: 1, score: 75, wins: 6, losses: 2 },
              { id: "b", label: "Kite", rank: 2, score: 25, wins: 2, losses: 6 },
            ],
          },
        })
      : route.fulfill({ status: 404, json: { error: { message: "Unavailable" } } }),
  );
  await page.goto(`/r/${"a".repeat(48)}/results`);
  await expect(page.getByRole("alert")).toContainText("Results are not available");
  visible = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Final results" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("75.0%");
  await expect(page.getByText("3 ballots started · 2 completed · 14 comparisons")).toBeVisible();
  visible = false;
  await page.getByRole("button", { name: "Refresh results" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
