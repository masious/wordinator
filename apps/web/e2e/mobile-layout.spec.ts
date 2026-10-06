import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";

const userId = "10000000-0000-4000-8000-000000000001";
const group = `/groups/${E2E_GROUP_ID}`;

// Mobile browsers widen the layout viewport to fit overflowing content (zooming the page out),
// so compare against the device viewport rather than innerWidth.
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const deviceWidth = page.viewportSize()?.width ?? 0;
  await expect.poll(
    () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth)),
    { message: `${label} must not be wider than the ${deviceWidth}px viewport` },
  ).toBeLessThanOrEqual(deviceWidth);
}

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth/sign-in", { data: { email: E2E_CREATOR_EMAIL, password: E2E_PASSWORD } });
});

test("authenticated routes stay within the mobile viewport", async ({ page }) => {
  const long = "Hoe gaat het met jullie vandaag? Ik oefen elke dag een beetje Nederlands met mijn vrienden.";
  const created = await page.request.post(`/api/groups/${E2E_GROUP_ID}/posts`, { data: { type: "question", body: long, notes: null } });
  expect(created.ok()).toBe(true);
  const { post } = await created.json() as { post: { id: string } };
  const course = await page.request.post(`/api/groups/${E2E_GROUP_ID}/courses`, {
    data: { title: "Dutch Foundations — Part III: Home and Surroundings", summary: "Introduce existence before teaching precise location.", level: "early, mid A1", intendedLearner: null },
  });
  expect(course.ok()).toBe(true);
  // A large cover reproduces intrinsic image sizes widening the feed; serve it locally instead of from the media domain.
  await page.goto("/ui");
  const cover = Buffer.from((await page.evaluate(() => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 1200, height: 620 });
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#1d3a8a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  })).split(",")[1]!, "base64");
  const { course: { id: courseId } } = await course.json() as { course: { id: string } };
  const uploaded = await page.request.post(`/api/groups/${E2E_GROUP_ID}/courses/${courseId}/cover`, {
    multipart: { image: { name: "cover.png", mimeType: "image/png", buffer: cover } },
  });
  expect(uploaded.ok()).toBe(true);
  const published = await page.request.post(`/api/groups/${E2E_GROUP_ID}/courses/${courseId}/visibility`, { data: { status: "published" } });
  expect(published.ok()).toBe(true);
  await page.route(/\/courses\/[^/]+\.png$/, (route) => route.fulfill({ contentType: "image/png", body: cover }));

  const routes: Array<[string, string]> = [
    ["feed", group],
    ["post detail", `${group}/posts/${post.id}`],
    ["courses", `${group}/courses`],
    ["course detail", `${group}/courses/${courseId}`],
    ["members", `${group}/members`],
    ["profile", `${group}/members/${userId}`],
    ["notices", `${group}/notifications`],
    ["settings", `${group}/settings`],
  ];
  for (const [label, route] of routes) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expectNoHorizontalOverflow(page, label);
    if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-${label.replace(/ /g, "-")}.png` });
  }

  await page.goto(group, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Write something…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoHorizontalOverflow(page, "composer");
});

test("mobile shell uses a slim header, four-slot dock, and More sheet", async ({ page }) => {
  await page.goto(group, { waitUntil: "networkidle" });
  const header = page.getByRole("banner");
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(headerBox!.y).toBe(0);
  expect(headerBox!.height).toBeLessThanOrEqual(57);
  await expect(header.getByRole("button", { name: "Account menu" })).toBeVisible();

  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(dock.getByRole("link")).toHaveCount(3);
  await expect(dock.getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
  const more = dock.getByRole("button", { name: "More" });
  await expect(more).not.toHaveAttribute("aria-current", "page");

  await more.click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  for (const name of ["Members", "My profile", "Settings", "Create a group", "Sign out"]) await expect(sheet.getByText(name, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, "More sheet");
  if (process.env.MOBILE_SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-more-sheet.png` }); }
  await sheet.getByRole("link", { name: "Members" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/members$/);
  await expect(more).toHaveAttribute("aria-current", "page");

  await header.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("group", { name: "Active group" }).locator('[role="menuitem"][aria-current="true"]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page, "account menu");
  if (process.env.MOBILE_SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-account-menu.png` }); }
});

test("mobile journal drops the hero and opens with a one-line prompt row", async ({ page }) => {
  // Enough posts that the prompt row can scroll away and reveal the floating create action.
  for (let index = 0; index < 4; index += 1) {
    const created = await page.request.post(`/api/groups/${E2E_GROUP_ID}/posts`, { data: { type: "shared_sentence", body: `Prompt row scroll filler ${index}\nNog een regel.\nEn nog een.`, notes: null } });
    expect(created.ok()).toBe(true);
  }
  await page.goto(group, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Create a group" })).toBeHidden();
  await expect(page.getByText("Share what you are learning and keep the conversation close.")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Alpha Journal" })).toBeAttached();

  const prompt = page.getByRole("button", { name: "Write something…" });
  await expect(prompt).toBeVisible();
  const promptBox = await prompt.boundingBox();
  expect(promptBox!.height).toBeLessThanOrEqual(56);
  await expect(page.getByRole("button", { name: "Create post" })).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole("button", { name: "Create post" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("button", { name: "Create post" })).toHaveCount(0);
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-journal-prompt.png` });
});

test("mobile discussion uses one frame per comment and an 8px reply indent", async ({ page }) => {
  const created = await page.request.post(`/api/groups/${E2E_GROUP_ID}/posts`, { data: { type: "shared_sentence", body: "Wij wonen in een klein huis.", notes: null } });
  expect(created.ok()).toBe(true);
  const { post } = await created.json() as { post: { id: string } };
  const comments = `/api/groups/${E2E_GROUP_ID}/posts/${post.id}/comments`;
  const comment = await page.request.post(comments, { data: { kind: "text", body: "Mooie zin!", parentId: null } });
  expect(comment.ok()).toBe(true);
  const { item } = await comment.json() as { item: { id: string } };
  const reply = await page.request.post(comments, { data: { kind: "text", body: "Dank je wel.", parentId: item.id } });
  expect(reply.ok()).toBe(true);
  const { item: replyItem } = await reply.json() as { item: { id: string } };

  await page.goto(`${group}/posts/${post.id}`, { waitUntil: "networkidle" });
  const top = page.locator(`#comment-${item.id}`);
  const nested = page.locator(`#comment-${replyItem.id}`);
  await expect(nested).toBeVisible();
  // The outer bezel dissolves; the reply has no frame of its own.
  await expect(top).toHaveCSS("padding-top", "0px");
  await expect(top).toHaveCSS("box-shadow", "none");
  await expect(nested.locator("> div")).toHaveCSS("box-shadow", "none");
  await expect(nested.locator("> div")).toHaveCSS("padding-top", "0px");
  const replies = nested.locator("..");
  await expect(replies).toHaveCSS("padding-left", "8px");
  await expect(replies).toHaveCSS("margin-left", "0px");
  await expect(replies).toHaveCSS("border-left-width", "1px");
  await expectNoHorizontalOverflow(page, "discussion");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-discussion.png`, fullPage: true });
});

test("mobile composer is a full-screen sheet with sticky title and action bars", async ({ page }) => {
  await page.goto(group, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Write something…" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a post" });
  await expect(dialog).toBeVisible();
  await page.getByRole("combobox", { name: "Post type" }).click();
  await page.getByRole("option", { name: "Reading" }).click();
  // Enough questions that the sheet has to scroll.
  for (let index = 0; index < 6; index += 1) await dialog.getByRole("button", { name: "Add question" }).click();

  const viewport = page.viewportSize()!;
  const title = dialog.getByRole("heading", { name: "Create a post" });
  const actions = dialog.getByRole("button", { name: "Publish post" }).locator("..");
  await expect(actions).toHaveCSS("position", "sticky");
  const actionsBox = await actions.boundingBox();
  expect(Math.round(actionsBox!.y + actionsBox!.height)).toBe(viewport.height);

  // Flat fieldset: no nested card below 48em.
  const fieldset = dialog.locator("fieldset");
  await expect(fieldset).toHaveCSS("box-shadow", "none");
  await expect(fieldset).toHaveCSS("padding-left", "0px");

  await page.getByLabel("Notes or hint").scrollIntoViewIfNeeded();
  const titleBox = await title.boundingBox();
  expect(titleBox!.y).toBeGreaterThanOrEqual(0);
  expect(titleBox!.y).toBeLessThan(56);
  const scrolledActions = await actions.boundingBox();
  expect(Math.round(scrolledActions!.y + scrolledActions!.height)).toBe(viewport.height);
  await expectNoHorizontalOverflow(page, "composer sheet");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-composer.png` });
});
