import { expect, test } from "@playwright/test";
import { registerAccount } from "./auth";

// A real, decodable 1×1 PNG so the browser's bitmap and canvas pipeline runs end to end.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`settings opens globally and uploads an avatar through the cropper (${viewport.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // Each variant (in each browser) has its own account; on the shared one, parallel runs change the same photo.
    await registerAccount(page, testInfo, `settings${viewport.name}`);

    // Legacy group settings links land on the single global settings page.
    await page.goto("/groups/legacy-library/settings/members");
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByLabel("Bio").fill(`Updated from the ${viewport.name} account page.`);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    const uploaded = page.waitForResponse((response) => response.url().endsWith("/api/settings/avatar") && response.request().method() === "POST");
    await page.locator('input[type="file"]').setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: PNG });
    const dialog = page.getByRole("dialog", { name: "Crop image" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("group", { name: /Crop frame/ })).toBeVisible();
    await dialog.getByRole("group", { name: /Crop frame/ }).focus();
    await page.keyboard.press("+");
    await expect(dialog.getByRole("slider", { name: "Zoom" })).toHaveAttribute("aria-valuenow", "1.1");
    await dialog.getByRole("button", { name: "Save image" }).click();
    expect((await uploaded).status()).toBe(200);
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Change profile photo" }).click();
    // Chosen from the keyboard: under load WebKit can keep the opening menu moving long enough to fail a click's stability wait.
    await page.getByRole("menuitem", { name: "Remove photo" }).press("Enter");
    await expect(page.getByRole("button", { name: "Choose a profile photo" })).toBeVisible();
  });
}
