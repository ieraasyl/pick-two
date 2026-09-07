import { expect, test } from "@playwright/test";

// Browser tests isolate UI behavior with API responses. auth.test.ts exercises the real Worker/D1 flow.
test("creator registration, verification, persistent sign-in, and sign-out", async ({
  page,
}, testInfo) => {
  let signedIn = false;
  let verified = false;
  let registered = false;
  const user = {
    id: "creator",
    email: "creator@example.com",
    name: "Creator",
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await page.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/get-session")) {
      return route.fulfill({
        json: signedIn
          ? {
              user,
              session: {
                id: "session",
                userId: user.id,
                token: "test-token",
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
              },
            }
          : null,
      });
    }
    const body = route.request().postDataJSON();
    if (path.endsWith("/sign-up/email")) {
      expect(body).toMatchObject({
        email: user.email,
        name: "Creator",
        password: "long-password-for-testing",
      });
      registered = true;
      return route.fulfill({ json: { token: null, user: { ...user, emailVerified: false } } });
    }
    if (path.endsWith("/email-otp/verify-email")) {
      expect(registered).toBe(true);
      if (body.otp !== "123456")
        return route.fulfill({
          status: 400,
          json: { code: "INVALID_OTP", message: "Invalid OTP" },
        });
      verified = true;
      return route.fulfill({ json: { status: true, token: null, user } });
    }
    if (path.endsWith("/sign-in/email")) {
      expect(verified).toBe(true);
      signedIn = true;
      return route.fulfill({ json: { token: "test-token", user } });
    }
    if (path.endsWith("/sign-out")) {
      signedIn = false;
      return route.fulfill({ json: { success: true } });
    }
    throw new Error(`Unexpected auth request: ${path}`);
  });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sign-in.png"), fullPage: true });
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Creator");
  await page.getByLabel("Email", { exact: true }).fill("Creator@example.com");
  await page.getByLabel("Password", { exact: true }).fill("long-password-for-testing");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid");
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.getByLabel("Password", { exact: true }).fill("long-password-for-testing");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  const form = await page.getByRole("region").boundingBox();
  expect(form).not.toBeNull();
  expect(form!.x).toBeGreaterThanOrEqual(0);
  expect(form!.x + form!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("sign-in failures remain recoverable without exposing the workspace", async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
    }),
  );
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("creator@example.com");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check your email and password");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
});
