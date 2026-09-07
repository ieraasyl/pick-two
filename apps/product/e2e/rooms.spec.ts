import { expect, test } from "@playwright/test";
import { roomInput } from "../shared/contracts/rooms.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        user: { id: "creator", name: "Creator", email: "creator@example.com", emailVerified: true },
        session: {
          id: "session",
          userId: "creator",
          token: "test",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    }),
  );
});

test("create, recover from a failed request, edit options, publish, and close", async ({
  page,
}) => {
  const room = {
    id: "room-one",
    ownerId: "creator",
    question: "",
    status: "draft",
    createdAt: 1,
    updatedAt: 1,
  };
  let labels: string[] = [];
  let failedOnce = false;
  let failPublish = true;
  await page.route("**/api/rooms**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/rooms" && req.method() === "GET")
      return route.fulfill({ json: { rooms: labels.length ? [room] : [] } });
    if (path === "/api/rooms" && req.method() === "POST") {
      if (!failedOnce) {
        failedOnce = true;
        return route.abort("failed");
      }
      const input = roomInput.parse(req.postDataJSON());
      room.question = input.question;
      labels = input.options;
      return route.fulfill({ status: 201, json: { room: { id: room.id } } });
    }
    if (path.endsWith("/publish")) {
      if (failPublish) {
        failPublish = false;
        return route.fulfill({
          status: 503,
          json: { error: { message: "Temporarily unavailable" } },
        });
      }
      room.status = "open";
      return route.fulfill({ json: { status: room.status } });
    }
    if (path.endsWith("/close")) {
      room.status = "closed";
      return route.fulfill({ json: { status: room.status } });
    }
    if (req.method() === "PUT") {
      const input = roomInput.parse(req.postDataJSON());
      room.question = input.question;
      labels = input.options;
      return route.fulfill({ json: { status: "draft" } });
    }
    return route.fulfill({
      json: {
        room,
        options: labels.map((label, position) => ({ id: `option-${position}`, label, position })),
      },
    });
  });
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Create ranking room" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Pick a name");
  for (const [i, value] of ["Orbit", "Kite", "Juniper", "Northstar"].entries())
    await page.getByLabel(`Option ${i + 1}`, { exact: true }).fill(value);
  const create = page.getByRole("button", { name: "Create room", exact: true });
  await create.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/rooms\/room-one$/);
  await page.getByRole("button", { name: "Edit room" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Updated question");
  await page.getByRole("button", { name: "Add option", exact: true }).click();
  await page.getByLabel("Option 5", { exact: true }).fill("Extra");
  await page.getByRole("button", { name: "Remove option 2", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated question" })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("listitem").last()).toContainText("Extra");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Temporarily unavailable");
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit room" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close voting" }).click();
  await expect(page.getByText("closed", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "← Dashboard" }).click();
  await expect(page.getByRole("link", { name: /Updated question/ })).toContainText("closed");
});

test("dashboard API errors offer a retry without claiming there are no rooms", async ({ page }) => {
  let fails = true;
  await page.route("**/api/rooms", (route) =>
    fails
      ? route.fulfill({
          status: 503,
          json: { error: { code: "API_UNAVAILABLE", message: "Unavailable" } },
        })
      : route.fulfill({ json: { rooms: [] } }),
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("alert")).toContainText("Unable to load rooms");
  await expect(page.getByRole("heading", { name: "No ranking rooms yet" })).toHaveCount(0);
  fails = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No ranking rooms yet" })).toBeVisible();
});
