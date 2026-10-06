import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_INVITATION_TOKEN, E2E_PASSWORD } from "./global-setup";

test("a member asks to contribute, adds a draft block, and the owner publishes it", async ({ browser }, testInfo) => {
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
  const { lesson } = await api<{ lesson: { id: string; version: number } }>(`/courses/${course.id}/lessons`, { title: `${suffix} lesson` });
  await api(`/courses/${course.id}/lessons/${lesson.id}`, { title: `${suffix} lesson`, goal: null, published: true, version: lesson.version }, "PATCH");

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
  await expect(helper.getByRole("button", { name: "Add block to lesson 1" })).toHaveCount(0);
  await helper.getByRole("button", { name: "Ask to contribute" }).click();
  await expect(helper.getByText("Your request is waiting for the course owner.")).toBeVisible();

  await owner.goto(coursePage);
  await owner.getByRole("button", { name: `Accept ${helperName} as a contributor` }).click();
  await expect(owner.getByRole("button", { name: `Remove ${helperName} as a contributor` })).toBeVisible();

  await helper.reload();
  await helper.getByRole("button", { name: "Add block to lesson 1" }).click();
  const form = helper.getByRole("form", { name: "New block" });
  await expect(form.getByLabel("Published to readers")).toHaveCount(0);
  await form.getByLabel(/^Text/).fill("Een voorstel van de helper.");
  await form.getByRole("button", { name: "Add block" }).click();
  const block = helper.locator("li").filter({ hasText: "Een voorstel van de helper." });
  await expect(block.getByText("Unpublished")).toBeVisible();
  await expect(block.getByRole("button", { name: "Edit Text block 1" })).toBeVisible();
  await expect(block.getByRole("button", { name: "Publish" })).toHaveCount(0);

  await owner.reload();
  const reviewed = owner.locator("li").filter({ hasText: "Een voorstel van de helper." });
  await expect(reviewed.getByText(`Last edited by ${helperName}`)).toBeVisible();
  await reviewed.getByRole("button", { name: "Publish" }).click();
  await expect(reviewed.getByText("Unpublished")).toHaveCount(0);

  // Published content belongs to the owner again.
  await helper.reload();
  await expect(helper.getByText("Een voorstel van de helper.")).toBeVisible();
  await expect(helper.getByRole("button", { name: "Edit Text block 1" })).toHaveCount(0);
});
