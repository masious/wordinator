import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_INVITATION_TOKEN, E2E_PASSWORD } from "./global-setup";

test("concealed answers, reading sets, replies, pins, and reactions work end to end", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `phase4-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`; const memberEmail = `${suffix}@e2e.test`; const memberPassword = "phase-four-member"; const memberName = `${suffix} learner`;
  const signIn = async (email: string, password: string) => { await page.goto("/"); await page.getByLabel("Email").fill(email); await page.getByRole("textbox", { name: "Password" }).fill(password); await page.getByRole("button", { name: "Sign in" }).click(); await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible(); };
  const signOut = async () => {
    const accountMenu = page.getByRole("button", { name: "Account menu" });
    if (await accountMenu.isVisible()) { await accountMenu.click(); await page.getByRole("menuitem", { name: "Sign out" }).click(); }
    else await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  };
  await signIn(E2E_CREATOR_EMAIL, E2E_PASSWORD);
  const createPost = async (type: string, bodyLabel: string, body: string) => { await page.getByRole("button", { name: "Create post" }).first().click(); await page.getByRole("combobox", { name: "Post type" }).click(); await page.getByRole("option", { name: type }).click(); await page.getByLabel(bodyLabel).fill(body); };
  const question = `${suffix} waarom?`; await createPost("Question", "Question", question); await page.getByRole("button", { name: "Publish post" }).click();
  const questionCard = page.locator("article").filter({ hasText: question }); const questionHref = await questionCard.getByRole("link").first().getAttribute("href");
  const reading = `${suffix} verhaal`; await createPost("Reading", "Paragraph", reading); await page.getByLabel("Question 1").fill("Wie?"); await page.getByRole("button", { name: "Add question" }).click(); await page.getByLabel("Question 2").fill("Waar?"); await page.getByRole("button", { name: "Publish post" }).click();
  const readingHref = await page.locator("article").filter({ hasText: reading }).getByRole("link").first().getAttribute("href");
  await signOut(); await page.goto(`/invite/${E2E_INVITATION_TOKEN}`); await page.getByLabel("Display name").fill(memberName); await page.getByLabel("Email").fill(memberEmail); await page.getByRole("textbox", { name: "Password" }).fill(memberPassword); await page.getByRole("button", { name: "Create account and request access" }).click(); await expect(page.getByText("Waiting for approval")).toBeVisible();
  await page.goto("/"); await signOut(); await signIn(E2E_CREATOR_EMAIL, E2E_PASSWORD); const request = page.getByText(memberName, { exact: true }).locator(".."); await request.getByRole("button", { name: "Accept" }).click(); await signOut(); await signIn(memberEmail, memberPassword);
  await page.goto(questionHref!); await expect(page.getByText("0 answers are concealed")).toBeVisible(); await page.getByLabel("Your answer").fill("Omdat samen leren helpt."); await page.getByRole("button", { name: "Publish response" }).click(); const answer = page.locator("article").filter({ hasText: "Omdat samen leren helpt." }); await expect(answer).toBeVisible(); await answer.getByRole("button", { name: "React with 👍" }).click(); await expect(answer.getByRole("button", { name: "React with 👍" })).toContainText("1");
  await page.goto(readingHref!); await page.getByLabel("Your answer").fill("Ada"); await page.getByRole("button", { name: "Next" }).click(); await expect(page.getByText("Question 2 of 2")).toBeVisible(); await page.getByRole("button", { name: "Publish answer set" }).click(); await expect(page.getByText("No answer").first()).toBeVisible();
  await signOut(); await signIn(E2E_CREATOR_EMAIL, E2E_PASSWORD); await page.getByRole("link", { name: "Notices" }).first().click(); await expect(page.getByText(`${memberName} responded to your post.`).first()).toBeVisible(); await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.goto(questionHref!); await expect(page.getByText("1 answer is concealed")).toBeVisible(); await page.getByRole("button", { name: "Reveal answers" }).click(); const creatorView = page.locator("article").filter({ hasText: "Omdat samen leren helpt." }); await creatorView.getByRole("button", { name: "Pin answer" }).click(); await expect(creatorView.getByText("Pinned answer")).toBeVisible(); await creatorView.getByRole("button", { name: "Reply" }).click(); await creatorView.getByLabel("Reply").fill("Dank je!"); await creatorView.getByRole("button", { name: "Publish reply" }).click(); await expect(creatorView.getByText("Dank je!")).toBeVisible();
  await signOut(); await signIn(memberEmail, memberPassword); await page.getByRole("link", { name: "Notices" }).first().click(); await expect(page.getByText("Creator pinned your answer.")).toBeVisible(); await page.getByText("Creator replied to you.").click(); await expect(page.getByText("Dank je!")).toBeVisible();
});
