import { expect, type Page } from "@playwright/test";

// Journal baselines need an empty feed regardless of what earlier specs seeded into the shared group,
// so each run creates its own group with a fixed name and the fixture's language. Its invitation token is random, so mask it.
export async function openEmptyJournal(page: Page) {
  const response = await page.request.post("/api/groups", { data: { name: "Baseline Journal", language: "nl" } });
  expect(response.ok()).toBe(true);
  const { group } = await response.json() as { group: { id: string } };
  return { path: `/groups/${group.id}`, mask: [page.getByText(/\/invite\//)] };
}
