import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";

test("a learner steps through a lesson and the course shows their progress", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `progress-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  const api = async <T,>(path: string, body: unknown, method = "POST"): Promise<T> => {
    const response = await page.request.fetch(`/api/groups/${E2E_GROUP_ID}${path}`, { method, data: body });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<T>;
  };
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Op reis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const lessons: string[] = [];
  for (const title of [`${suffix} first`, `${suffix} second`]) {
    const { lesson } = await api<{ lesson: { id: string; version: number } }>(`/courses/${course.id}/lessons`, { title });
    await api(`/courses/${course.id}/lessons/${lesson.id}`, { title, goal: null, published: true, version: lesson.version }, "PATCH");
    lessons.push(lesson.id);
  }
  await api(`/courses/${course.id}/lessons/${lessons[0]}/blocks`, { kind: "example", published: true, payload: { sentence: "Waar is het station?", translation: "Where is the station?" } });
  await api(`/courses/${course.id}/lessons/${lessons[0]}/blocks`, { kind: "dialogue", published: true, payload: { turns: [{ speaker: "A", text: "Rechtdoor." }, { speaker: "B", text: "Dank je wel." }] } });
  await api(`/courses/${course.id}/lessons/${lessons[0]}/blocks`, { kind: "practice", published: true, payload: { instruction: "Vertaal.", items: [{ prompt: "Turn left." }] } });

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  const progress = page.getByRole("progressbar", { name: "Course progress for", exact: false }).first();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Start lesson 1" }).click();

  const player = page.getByRole("dialog");
  await expect(player.getByText("Step 1 of 4")).toBeVisible();
  await player.getByRole("button", { name: "Show translation" }).click();
  await expect(player.getByText("Where is the station?")).toBeVisible();
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Rechtdoor.")).toBeVisible();
  await expect(player.getByText("Dank je wel.")).toHaveCount(0);
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Dank je wel.")).toBeVisible();
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Question 1 of 1")).toBeVisible();
  await player.getByLabel("Your answer").fill("Ga linksaf.");
  await player.getByRole("button", { name: "Finish lesson" }).click();

  await expect(player.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(player.getByText("You have finished 1 of 2 lessons (50%).")).toBeVisible();
  await player.getByRole("button", { name: "Back to the course" }).click();
  await expect(page.getByRole("button", { name: "Practise lesson 1 again" })).toBeVisible();
  await expect(page.getByText("1 of 2 lessons")).toBeVisible();

  // The answer typed in the player stays as the practice draft in the lesson view.
  await expect(page.getByLabel(/^1\. Turn left\./)).toHaveValue("Ga linksaf.");
});
