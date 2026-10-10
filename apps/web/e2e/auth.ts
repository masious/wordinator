import { expect, type Page, type TestInfo } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_PASSWORD } from "./global-setup";

// Accounts a spec creates carry this tag, so a spec reruns cleanly against a database an earlier run left behind (a reused
// server or --repeat-each). It stays short enough for usernames.
const run = Date.now().toString(36).slice(-5);
export const uniqueTag = (testInfo: TestInfo) => `${testInfo.project.name.replaceAll(/[^a-z]/g, "")}${testInfo.repeatEachIndex}${run}`;

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

// A fresh, onboarded account through the API, for specs that read the viewer's own newest-first lists (such as bookmarks), where
// another test's writes to the shared seeded account would interleave. `name` must be a short username-safe word.
export async function registerAccount(page: Page, testInfo: TestInfo, name: string) {
  const tag = uniqueTag(testInfo);
  // WebKit keeps the session cookie after the sign-out response, so drop the context's cookies instead.
  await page.context().clearCookies();
  const registered = await page.request.post("/api/auth/register", { data: { email: `${name}-${tag}@e2e.test`, password: E2E_PASSWORD } });
  expect(registered.ok(), `register: ${registered.status()} ${await registered.text()}`).toBe(true);
  const onboarded = await page.request.post("/api/auth/complete-onboarding", { data: { username: `${name}_${tag}` } });
  expect(onboarded.ok(), "complete onboarding").toBe(true);
}
