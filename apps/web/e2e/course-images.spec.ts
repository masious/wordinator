import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, paragraph, seedLesson } from "./lessonSeed";

// A 4×4 opaque PNG, small enough to inline and real enough for the browser to decode and re-encode.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4UaEBRwzEcQBTUhaBGaoOzwAAAABJRU5ErkJggg==", "base64");

test("an author uploads a lesson image, must add alt text, and readers see it", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `images-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Beelden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [paragraph("De keuken.")], { publish: false });

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  await page.getByRole("button", { name: "Edit lesson 1" }).click();
  await page.getByText("De keuken.").click();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await expect(page.getByRole("option", { name: "Image" })).toBeVisible();
  await page.keyboard.press("Enter");

  // BlockNote's upload panel offers uploads only; the chosen file opens Wordinator's image dialog.
  await expect(page.getByRole("tab", { name: "Link" })).toHaveCount(0);
  await page.getByRole("tabpanel", { name: "Upload" }).locator('input[type="file"]').setInputFiles({ name: "keuken.png", mimeType: "image/png", buffer: PNG });
  const dialog = page.getByRole("dialog", { name: "Add an image" });
  await expect(dialog.getByRole("radio", { name: "Whole" })).toBeChecked();
  const uploaded = page.waitForResponse((response) => response.url().endsWith("/images") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Insert image" }).click();
  expect((await uploaded).status()).toBe(201);
  await expect(dialog).toHaveCount(0);
  const image = page.locator('.bn-editor [data-content-type="image"] img');
  await expect(image).toHaveAttribute("src", /\/courses\/.+\/lessons\/.+\//);

  const bar = page.getByRole("region", { name: "Lesson saving and publishing" });
  await expect(bar.getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });
  await bar.getByRole("button", { name: "Publish lesson" }).click();
  await bar.getByRole("button", { name: "An image needs alt text." }).click();

  // The image toolbar edits the alt text, stored as the image's name.
  await page.getByRole("button", { name: "Edit alt text" }).click();
  await page.getByPlaceholder("Edit alt text").fill("Een lichte keuken");
  await page.keyboard.press("Enter");
  await expect(bar.getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });
  await bar.getByRole("button", { name: "Publish lesson" }).click();
  await expect(bar.getByText("Unpublished", { exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Done editing" }).click();

  // The e2e media base URL is not served locally, so the reader's image is checked by its attributes.
  await expect(page.getByRole("img", { name: "Een lichte keuken" })).toHaveAttribute("src", /\/courses\/.+\/lessons\/.+\.jpg$/);
});
