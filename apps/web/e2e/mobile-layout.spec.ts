import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, dialogue, example, openLesson, paragraph, practice, seedLesson, vocabulary } from "./lessonSeed";
import { expectRecapFits, pageToWord } from "./wordRecap";

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
    ["words", `${group}/words`],
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
  for (const name of ["Words", "Members", "My profile", "Settings", "Create a group", "Sign out"]) await expect(sheet.getByText(name, { exact: true })).toBeVisible();
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

test("mobile course page lists lessons that open their own page", async ({ page }) => {
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: "Outline course", summary: "Two lessons." });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, "Er is een huis", [paragraph("Het huis is groot.")]);
  await seedLesson(page, course.id, "Waar is de kat?", [practice("Vertaal de zinnen.", ["One.", "Two.", "Three.", "Four with a much longer prompt that has to wrap on a narrow phone screen."].map((prompt) => ({ prompt })))]);

  await page.goto(`${group}/courses/${course.id}`, { waitUntil: "networkidle" });
  const lessons = page.getByRole("region", { name: "Lessons" });
  await expect(lessons.getByRole("link")).toHaveCount(2);
  await expect(page.getByText("Het huis is groot.")).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "course lesson list");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-course-lessons.png` });

  await openLesson(page, 2);
  await expect(page.getByRole("heading", { level: 1, name: "Waar is de kat?" })).toBeVisible();
  await expect(page.getByText("and 1 more question")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous: Er is een huis" })).toBeVisible();
  await expectNoHorizontalOverflow(page, "lesson page");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-lesson-page.png` });
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Answer the practice" }).getByRole("button", { name: "Publish answer set" })).toBeVisible();
  await expectNoHorizontalOverflow(page, "practice answer dialog");
});

test("mobile lesson player stays within the viewport at every step", async ({ page }) => {
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: "Player course", summary: "Op reis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, "Onderweg naar het station", [
    example("Waar is het dichtstbijzijnde treinstation in deze buurt?", "Where is the nearest train station in this neighbourhood?", "Dichtstbijzijnde is een lange overtreffende trap."),
    dialogue([{ speaker: "Reiziger", text: "Moet ik hier rechtdoor of linksaf?" }, { speaker: "Buurvrouw", text: "Rechtdoor, en dan de tweede straat rechts." }]),
    practice("Vertaal.", [{ prompt: "Turn left at the traffic lights." }]),
  ]);

  await page.goto(`${group}/courses/${course.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start lesson 1" }).click();
  const player = page.getByRole("dialog");
  const steps: Array<[string, () => Promise<void>]> = [
    ["example", () => expect(player.getByText("Step 1 of 4")).toBeVisible()],
    ["dialogue", () => expect(player.getByText("Moet ik hier rechtdoor of linksaf?")).toBeVisible()],
    ["dialogue turn", () => expect(player.getByText("Rechtdoor, en dan de tweede straat rechts.")).toBeVisible()],
    ["practice", () => expect(player.getByText("Question 1 of 1")).toBeVisible()],
  ];
  for (const [index, [label, ready]] of steps.entries()) {
    if (index > 0) await player.getByRole("button", { name: "Next" }).click();
    await ready();
    await expectNoHorizontalOverflow(page, `lesson player ${label}`);
    if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-player-${label.replace(/ /g, "-")}.png` });
  }
  await player.getByLabel("Your answer").fill("Ga linksaf bij het stoplicht.");
  await player.getByRole("button", { name: "Finish lesson" }).click();
  await expect(player.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expectNoHorizontalOverflow(page, "lesson player finish");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-player-finish.png` });
});

test("mobile new words panel and word recap stay within the viewport", async ({ page }) => {
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: "Words course", summary: "Nieuwe woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, "Op het station", [
    example("Het perron is aan de overkant van het spoor.", "The platform is across the track."),
    vocabulary(
      { term: "het perron", meaning: "the platform", forms: "de perrons", example: "Het perron is vol.", note: "A het-word: het perron, die perrons." },
      { term: "de overstapmogelijkheid", meaning: "the possibility to change trains", forms: "de overstapmogelijkheden" },
    ),
  ]);

  await page.goto(`${group}/courses/${course.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start lesson 1" }).click();
  const player = page.getByRole("dialog");
  await expect(player.getByRole("region", { name: "New words" })).toContainText("de overstapmogelijkheid");
  await expectNoHorizontalOverflow(page, "lesson player new words panel");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-player-words.png` });
  await player.getByRole("button", { name: "Finish lesson" }).click();
  await player.getByRole("button", { name: "Review words" }).click();
  const platform = player.getByRole("article", { name: "het perron" });
  await platform.getByRole("button", { name: "Show meaning" }).click();
  await expect(platform.getByText("the platform", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, "lesson word recap");
  await expectRecapFits(page, "lesson word recap");
  await pageToWord(player, "de overstapmogelijkheid");
  await expectNoHorizontalOverflow(page, "lesson word recap long term");
  await expectRecapFits(page, "lesson word recap long term");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-word-recap.png` });
});

test("mobile lesson reader stacks columns", async ({ page }) => {
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: "Columns course", summary: "Naast elkaar" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const column = (text: string) => ({ id: crypto.randomUUID(), type: "column", props: { width: 1 }, children: [paragraph(text)] });
  await seedLesson(page, course.id, "Links en rechts", [{ id: crypto.randomUUID(), type: "columnList", props: {}, children: [column("De linker kolom met een zin."), column("De rechter kolom met een zin.")] }]);

  await page.goto(`${group}/courses/${course.id}`, { waitUntil: "networkidle" });
  await openLesson(page);
  const left = page.getByText("De linker kolom met een zin.", { exact: true });
  const right = page.getByText("De rechter kolom met een zin.", { exact: true });
  await expect(right).toBeVisible();
  const [leftBox, rightBox] = [(await left.boundingBox())!, (await right.boundingBox())!];
  expect(Math.abs(rightBox.x - leftBox.x)).toBeLessThan(2);
  expect(rightBox.y).toBeGreaterThanOrEqual(leftBox.y + leftBox.height);
  await expectNoHorizontalOverflow(page, "lesson with columns");
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-lesson-columns.png` });
});

test("mobile Words tab opens from the More sheet and fits its cards without scrolling", async ({ page }, testInfo) => {
  const api = courseApi(page);
  // The phone projects share the seeded account, so each bookmarks words of its own course.
  const courseTitle = `Bookmarked course ${testInfo.project.name}`;
  const { course } = await api<{ course: { id: string } }>("/courses", { title: courseTitle, summary: "Woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const lessonId = await seedLesson(page, course.id, "Op het station", [
    example("Het perron is aan de overkant van het spoor.", "The platform is across the track."),
    vocabulary({ term: "het perron", meaning: "the platform", note: "A het-word." }, { term: "de overstapmogelijkheid", meaning: "the possibility to change trains" }),
  ]);
  const { lesson } = await api<{ lesson: { document: { blocks: Array<{ type: string; props: { data?: string } }> } } }>(`/courses/${course.id}/lessons/${lessonId}`);
  const words = JSON.parse(lesson.document.blocks.find((block) => block.type === "vocabulary")!.props.data!) as { words: Array<{ id: string }> };
  for (const word of words.words) await api(`/courses/${course.id}/lessons/${lessonId}/words/${word.id}/bookmark`, undefined, "PUT");

  // WebKit can take long to settle the feed's network, so wait for the dock instead of network idle.
  await page.goto(group);
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Words" }).click();
  await expect(page).toHaveURL(/\/words$/);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
  // Newest first, and a narrow phone fits one card per page, so page to the first bookmarked word.
  const card = page.getByRole("article", { name: "het perron" }).filter({ hasText: courseTitle });
  await expect(page.getByRole("heading", { name: "Your words" })).toBeVisible();
  await expect(page.getByRole("article").first()).toBeVisible();
  for (let pages = 0; pages < 20 && !await card.isVisible(); pages += 1) await page.getByRole("button", { name: "Next" }).click();
  await expect(card).toContainText(`${courseTitle} · Op het station`);
  await card.getByRole("button", { name: "Show meaning" }).click();
  await expect(card.getByText("the platform", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, "words tab");
  // The cards, counter, and Back and Next sit above the dock without scrolling.
  await page.waitForTimeout(600);
  const next = await page.getByRole("button", { name: /^(Next)$/ }).boundingBox();
  const dock = await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox();
  expect(next!.y + next!.height).toBeLessThanOrEqual(dock!.y);
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-words-tab.png` });
});
