import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";

// A real, decodable 1×1 PNG so the browser's bitmap and canvas pipeline runs end to end.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`settings opens on Account and uploads an avatar through the cropper (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

    await page.goto(`/groups/${E2E_GROUP_ID}/settings`);
    await expect(page).toHaveURL(new RegExp(`/groups/${E2E_GROUP_ID}/settings/account$`));
    await expect(page.getByText("Applies in every group")).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Remove image" })).toBeVisible();
    await page.getByRole("button", { name: "Remove image" }).click();
    await expect(page.getByRole("button", { name: "Remove image" })).toBeHidden();
  });
}
