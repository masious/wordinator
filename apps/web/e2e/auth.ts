import { expect, type Page } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_PASSWORD } from "./global-setup";

// The signed-out home page opens on account creation, so signing in goes through its alternate path.
export async function signIn(page: Page, email = E2E_CREATOR_EMAIL, password = E2E_PASSWORD) {
  await page.goto("/");
  await page.getByRole("button", { name: "I already have an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();
}

// Open registration followed by the required username setup; the avatar stays optional.
export async function registerLearner(page: Page, email: string, password: string, username: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Set up your account." })).toBeVisible();
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("button", { name: "Open the lesson library" }).click();
  await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
}
