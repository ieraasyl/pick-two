import { test, expect } from "./fixture.js";

test("creator recovers a password through email and old sessions are revoked", async ({
  page,
  app,
  browser,
}) => {
  const email = "recovery@example.com";
  const oldPassword = "old-password-for-recovery";
  const newPassword = "new-password-for-recovery";
  await page.goto(`${app.origin}/sign-in`);
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Creator");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(oldPassword);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect.poll(() => app.messages.length).toBe(1);
  const otp = app.messages[0].text.match(/\b\d{6}\b/)![0];
  await page.getByLabel("Verification code").fill(otp);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill(oldPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${app.origin}/dashboard`);
  const recoveryContext = await browser.newContext();
  try {
    const recovery = await recoveryContext.newPage();
    await recovery.goto(`${app.origin}/sign-in`);
    await recovery.getByRole("link", { name: "Forgot password?" }).click();
    await expect(recovery.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
    await recovery.getByLabel("Email", { exact: true }).fill(email);
    await recovery.getByRole("button", { name: "Send reset link" }).click();
    await expect(recovery.getByRole("status")).toContainText("If an account exists");
    await expect.poll(() => app.messages.length).toBe(2);
    const link = app.messages[1].text.match(/http:\/\/\S+/)![0];
    await recovery.goto(link);
    await recovery.reload();
    await recovery.getByLabel("New password", { exact: true }).fill(newPassword);
    await recovery.getByLabel("Confirm password", { exact: true }).fill("mismatching-password");
    await recovery.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(recovery.getByRole("alert")).toContainText("Passwords do not match");
    await recovery.getByLabel("Confirm password", { exact: true }).fill(newPassword);
    await recovery.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(recovery.getByRole("status")).toContainText("Your password has been reset");
    expect(new URL(recovery.url()).hash).toBe("");
    await page.reload();
    await expect(page).toHaveURL(`${app.origin}/sign-in`);
    await recovery.getByRole("link", { name: "Back to sign in" }).click();
    await recovery.getByLabel("Email", { exact: true }).fill(email);
    await recovery.getByLabel("Password", { exact: true }).fill(newPassword);
    await recovery.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(recovery).toHaveURL(`${app.origin}/dashboard`);
    await recovery.goto(link);
    await recovery.getByLabel("New password", { exact: true }).fill(newPassword);
    await recovery.getByLabel("Confirm password", { exact: true }).fill(newPassword);
    await recovery.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(recovery.getByRole("alert")).toContainText("expired or already been used");
    await recovery.goto(`${app.origin}/reset-password`);
    await expect(recovery.getByRole("alert")).toContainText("missing a token");
  } finally {
    await recoveryContext.close();
  }
});
