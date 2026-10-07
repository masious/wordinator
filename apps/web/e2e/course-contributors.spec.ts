import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_INVITATION_TOKEN, E2E_PASSWORD } from "./global-setup";
import { paragraph, seedLesson } from "./lessonSeed";

test("a member asks to contribute, edits the lesson draft, and the owner publishes it", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `contributor-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  const helperName = `${testInfo.project.name} helper`;
  const helperEmail = `${suffix}@e2e.test`;
  const owner = await (await browser.newContext()).newPage();
  const helper = await (await browser.newContext()).newPage();
  const signIn = async (page: Page, email: string, password: string) => {
    await page.goto("/"); await page.getByLabel("Email").fill(email); await page.getByRole("textbox", { name: "Password" }).fill(password); await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  };

  // The owner prepares a published course with one published lesson through the API; the journey under test is contributing.
  await signIn(owner, E2E_CREATOR_EMAIL, E2E_PASSWORD);
  const api = async <T,>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> => {
    const response = await owner.request.fetch(`/api/groups/${E2E_GROUP_ID}${path}`, { method, data: body });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<T>;
  };
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Samen bouwen" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(owner, course.id, `${suffix} lesson`, [paragraph("De eerste zin.")]);

  // The helper joins the group through the invitation, and the owner accepts them.
  await helper.goto(`/invite/${E2E_INVITATION_TOKEN}`);
  await helper.getByLabel("Display name").fill(helperName); await helper.getByLabel("Email").fill(helperEmail); await helper.getByRole("textbox", { name: "Password" }).fill("helper-password");
  await helper.getByRole("button", { name: "Create account and request access" }).click();
  await expect(helper.getByText("Waiting for approval")).toBeVisible();
  const memberships = await api<{ pending: Array<{ id: string; displayName: string }> }>("/memberships");
  const helperId = memberships.pending.find((entry) => entry.displayName === helperName)!.id;
  await api(`/memberships/${helperId}`, { decision: "accept" }, "PATCH");

  const coursePage = `/groups/${E2E_GROUP_ID}/courses/${course.id}`;
  await helper.goto(coursePage);
  await expect(helper.getByRole("button", { name: "Edit lesson 1" })).toHaveCount(0);
  await helper.getByRole("button", { name: "Ask to contribute" }).click();
  await expect(helper.getByText("Your request is waiting for the course owner.")).toBeVisible();

  await owner.goto(coursePage);
  await owner.getByRole("button", { name: `Accept ${helperName} as a contributor` }).click();
  await expect(owner.getByRole("button", { name: `Remove ${helperName} as a contributor` })).toBeVisible();

  // The contributor edits the published lesson's draft in the editor; it autosaves but readers still see the published text.
  await helper.reload();
  await helper.getByRole("button", { name: "Edit lesson 1" }).click();
  const editor = helper.getByRole("textbox").filter({ hasText: "De eerste zin." });
  await editor.getByText("De eerste zin.").click();
  await helper.keyboard.press("End");
  await helper.keyboard.press("Enter");
  await helper.keyboard.type("Een voorstel van de helper.");
  const bar = helper.getByRole("region", { name: "Lesson saving and publishing" });
  await expect(bar.getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });
  await expect(bar.getByText("Unpublished changes")).toBeVisible();
  await expect(bar.getByRole("button", { name: /Publish/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Done editing" }).click();
  await expect(helper.getByText("Een voorstel van de helper.")).toHaveCount(0);

  // The owner reviews the draft and publishes it.
  await owner.reload();
  await owner.getByRole("button", { name: "Edit lesson 1" }).click();
  const ownerBar = owner.getByRole("region", { name: "Lesson saving and publishing" });
  await expect(owner.getByText("Een voorstel van de helper.")).toBeVisible();
  await expect(ownerBar.getByText(`Last edited by ${helperName}`)).toBeVisible();
  await ownerBar.getByRole("button", { name: "Publish changes" }).click();
  await expect(ownerBar.getByText("Unpublished changes")).toHaveCount(0);
  await ownerBar.getByRole("button", { name: "Done editing" }).click();

  await helper.reload();
  await expect(helper.getByText("Een voorstel van de helper.")).toBeVisible();
});
