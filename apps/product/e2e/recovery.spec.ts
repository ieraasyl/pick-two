import { expect, test } from "@playwright/test";

test("switching reset links in one tab clears the form and submits the new token", async ({
  page,
}) => {
  const tokens: string[] = [];
  await page.route("**/api/auth/reset-password", async (route) => {
    tokens.push(route.request().postDataJSON().token);
    await route.fulfill({ json: { status: true } });
  });
  await page.goto("/reset-password#token=old-token");
  const password = page.getByLabel("New password", { exact: true });
  const confirmation = page.getByLabel("Confirm password", { exact: true });
  const submit = page.getByRole("button", { name: "Reset password", exact: true });
  await password.fill("a-long-new-password");
  await confirmation.fill("a-different-password");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  await page.goto("/reset-password#token=new-token");
  await expect(password).toHaveValue("");
  await expect(confirmation).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await password.fill("a-long-new-password");
  await confirmation.fill("a-long-new-password");
  await submit.click();
  await expect(page.getByRole("status")).toContainText("Your password has been reset");
  expect(tokens).toEqual(["new-token"]);
  await page.goto("/reset-password#token=third-token");
  await expect(password).toBeVisible();
  await expect(password).toHaveValue("");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.goto("/reset-password#");
  await expect(page.getByRole("alert")).toContainText("missing a token");
});
