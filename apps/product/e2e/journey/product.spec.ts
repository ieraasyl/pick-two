import { test, expect } from "./fixture.js";
import { ballotState } from "../../shared/contracts/voting.js";
import { resultsContract } from "../../shared/contracts/results.js";

test("creator and anonymous participants complete the real product journey", async ({
  page,
  browser,
  app,
}) => {
  const email = "creator@example.com";
  const password = "journey-password-123456";
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") violations.push(message.text());
  });
  const document = await page.goto(`${app.origin}/dashboard`);
  expect(document!.headers()["content-security-policy"]).toContain("script-src 'self'");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Creator");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect
    .poll(() => app.messages.find((message) => message.to.includes(email))?.text)
    .toMatch(/\b\d{6}\b/);
  const otp = app.messages
    .find((message) => message.to.includes(email))!
    .text.match(/\b\d{6}\b/)![0];
  await page.getByLabel("Verification code").fill(otp);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await page.getByRole("link", { name: "Create ranking room" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Choose a name");
  const labels = ["Orbit", "Kite", "Juniper", "Northstar"];
  for (const [index, label] of labels.entries())
    await page.getByLabel(`Option ${index + 1}`, { exact: true }).fill(label);
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page).toHaveURL(/\/rooms\/[a-f0-9-]{36}$/);
  const roomUrl = page.url();
  const roomId = new URL(roomUrl).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Archive room", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restore room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit room" })).toHaveCount(0);
  await page.getByRole("link", { name: "← Dashboard" }).click();
  await expect(page.getByRole("link", { name: /Choose a name/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByRole("link", { name: /Choose a name/ }).click();
  await page.reload();
  await page.getByRole("button", { name: "Restore room" }).click();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Archive room", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Voting link", { exact: true })).toHaveValue(/\/r\/[a-f0-9]{48}$/);
  const votingUrl = await page.getByLabel("Voting link", { exact: true }).inputValue();
  const token = new URL(votingUrl).pathname.split("/").at(-1)!;
  const api = `${app.origin}/api/voting/${token}`;
  const participant = await browser.newContext({ viewport: page.viewportSize()! });
  const lateParticipant = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    const voter = await participant.newPage();
    await voter.goto(votingUrl);
    expect((await participant.request.get(`${app.origin}/api/me`)).status()).toBe(401);
    expect(
      (await participant.request.get(`${app.origin}/api/rooms/${roomId}/results`)).status(),
    ).toBe(401);
    expect((await participant.request.get(`${api}/results`)).status()).toBe(404);
    const visibility = page.getByRole("combobox", { name: "Public results", exact: true });
    await visibility.selectOption("always");
    await expect(visibility).toBeEnabled();
    expect((await participant.request.get(`${api}/results`)).status()).toBe(200);
    await visibility.selectOption("after_close");
    await expect(visibility).toBeEnabled();
    expect((await participant.request.get(`${api}/results`)).status()).toBe(404);

    await voter.getByRole("button", { name: "Start voting" }).click();
    await expect(voter.getByRole("progressbar")).toHaveAttribute("value", "0");
    const initial = ballotState.parse(await (await participant.request.get(api)).json());
    const first = initial.comparison!;
    const firstWinner = first.choices[0];
    await voter.getByRole("button", { name: firstWinner.label, exact: true }).click();
    await expect(voter.getByRole("progressbar")).toHaveAttribute("value", "1");
    const duplicate = await participant.request.post(`${api}/votes`, {
      headers: { Origin: app.origin },
      data: { comparisonId: first.id, winnerId: firstWinner.id },
    });
    expect(duplicate.status()).toBe(409);
    await voter.reload();
    await expect(voter.getByRole("progressbar")).toHaveAttribute("value", "1");
    // Choose consistently by label so the final ranking can be asserted independently.
    const wins = new Map(labels.map((label) => [label, 0]));
    wins.set(firstWinner.label, 1);
    for (let completed = 1; completed < 6; completed++) {
      const state = ballotState.parse(await (await participant.request.get(api)).json());
      expect(state.completed).toBe(completed);
      const winner = [...state.comparison!.choices].sort(
        (a, b) => labels.indexOf(a.label) - labels.indexOf(b.label),
      )[0];
      wins.set(winner.label, wins.get(winner.label)! + 1);
      await voter.getByRole("button", { name: winner.label, exact: true }).click();
      if (completed < 5)
        await expect(voter.getByRole("progressbar")).toHaveAttribute(
          "value",
          String(completed + 1),
        );
    }
    await expect(voter.getByRole("heading", { name: "You’re all done!" })).toBeVisible();
    await voter.reload();
    await expect(voter.getByRole("heading", { name: "You’re all done!" })).toBeVisible();

    const late = await lateParticipant.newPage();
    await late.goto(votingUrl);
    await late.getByRole("button", { name: "Start voting" }).click();
    await expect(late.getByRole("progressbar")).toHaveAttribute("value", "0");
    const pending = ballotState.parse(
      await (await lateParticipant.request.get(api)).json(),
    ).comparison!;
    await page.getByRole("button", { name: "Close voting" }).click();
    await expect(page.getByText("closed", { exact: true })).toBeVisible();
    const rejected = await lateParticipant.request.post(`${api}/votes`, {
      headers: { Origin: app.origin },
      data: { comparisonId: pending.id, winnerId: pending.choices[0].id },
    });
    expect(rejected.status()).toBe(409);
    await late.reload();
    await expect(late.getByRole("heading", { name: "Voting is closed" })).toBeVisible();
    await page.getByRole("link", { name: "View results", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Final results" })).toBeVisible();
    await expect(page.getByText("2 ballots started · 1 completed · 6 comparisons")).toBeVisible();
    const results = resultsContract.parse(
      await (await participant.request.get(`${api}/results`)).json(),
    );
    expect(results).toMatchObject({
      ballots: 2,
      completedBallots: 1,
      comparisons: 6,
      status: "closed",
    });
    for (const row of results.ranking) {
      expect(row.wins).toBe(wins.get(row.label));
      expect(row.losses).toBe(3 - row.wins);
      expect(row.score).toBe((100 * row.wins) / 3);
    }
    await voter.getByRole("link", { name: "View results when available" }).click();
    await expect(voter.getByRole("heading", { name: "Final results" })).toBeVisible();
    await expect(voter.getByRole("table")).toContainText(results.ranking[0].label);
    await page.goto(roomUrl);
    await page.getByRole("button", { name: "Archive room", exact: true }).click();
    await expect(page.getByRole("button", { name: "Restore room" })).toBeVisible();
    expect(
      resultsContract.parse(await (await participant.request.get(`${api}/results`)).json()),
    ).toEqual(results);
    await page.getByRole("button", { name: "Restore room" }).click();
    await expect(page.getByText("closed", { exact: true })).toBeVisible();
    expect(
      resultsContract.parse(await (await participant.request.get(`${api}/results`)).json()),
    ).toEqual(results);
    await page
      .getByRole("combobox", { name: "Public results", exact: true })
      .selectOption("private");
    await expect(page.getByRole("combobox")).toBeEnabled();
    await voter.getByRole("button", { name: "Refresh results" }).click();
    await expect(voter.getByRole("alert")).toContainText("Results are not available");
    await expect(voter.getByRole("table")).toHaveCount(0);
    expect(violations.filter((message) => /content security policy/i.test(message))).toEqual([]);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto(roomUrl);
    await expect(page).toHaveURL(/\/sign-in$/);
  } finally {
    await participant.close();
    await lateParticipant.close();
  }
});
