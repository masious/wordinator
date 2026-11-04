import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { AdminImage } from "@wordinator/contracts/admin";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { AdminImagesPage, prepareReplacement, validateImagesSearch, type AdminImagesSearch } from "./AdminImagesPage";

const groupId = "20000000-0000-4000-8000-000000000001";
let superuser = true;
let replaceStatus = 200;

const course = { id: "c1", slug: "dutch", title: "Dutch foundations", status: "published" as const };
const lesson = { id: "l1", slug: "market", title: "At the market", position: 2 };
const image = (overrides: Partial<AdminImage>): AdminImage => ({
  key: "courses/c1/cover.jpg", url: "https://media.test/courses/c1/cover.jpg", kind: "cover", width: null, height: null, createdAt: 1,
  course, lesson: null, dialogue: null, usedInDraft: true, usedInPublished: true, ...overrides,
});
const images = [
  image({}),
  image({ key: "courses/c1/lessons/l1/a.jpg", url: "https://media.test/a.jpg", kind: "lesson", lesson, usedInDraft: false, usedInPublished: false }),
  image({
    key: "courses/c1/lessons/l1/dialogues/b1/mask/m.png", url: "https://media.test/m.png", kind: "mask", width: 3, height: 2, lesson,
    dialogue: { blockId: "b1", speaker: null, lineIndex: 1, section: "Buying bread", line: { speaker: "Bram", text: "Dag Anna." } },
  }),
];

const session = () => ({
  status: "signedIn",
  user: { id: "10000000-0000-4000-8000-000000000001", displayName: "Ada", username: "ada", avatarUrl: null, mustChangePassword: false, onboardingComplete: true, isSuperuser: superuser },
  groups: [{ id: groupId, name: "Library", language: "nl", role: "creator", icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [], requests: [],
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

function renderPage(search: AdminImagesSearch = {}, onSearch = vi.fn()) {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "$", component: () => <AdminImagesPage groupId={groupId} search={search} onSearch={onSearch} /> });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/admin/images"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
  return onSearch;
}

beforeEach(() => {
  superuser = true; replaceStatus = 200;
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:preview"); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return json(session());
    if (path === "/api/admin/images/filters") return json({ courses: [{ id: "c1", title: "Dutch foundations", lessons: [{ id: "l1", title: "At the market", position: 2 }] }] });
    if (path === "/api/admin/images/replace" && init?.method === "POST") {
      return replaceStatus === 200
        ? json({ image: { ...images[2], key: "courses/c1/lessons/l1/dialogues/b1/mask/new.png", url: "https://media.test/new.png" }, previousKey: images[2]!.key })
        : json({ error: { code: "IMAGE_NOT_FOUND", message: "Gone." } }, replaceStatus);
    }
    if (path.startsWith("/api/admin/images")) return json({ images, nextCursor: null });
    return json({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const fetched = () => vi.mocked(fetch).mock.calls.map(([input]) => String(input));
const card = (name: string) => screen.findByRole("listitem", { name });

describe("image library page", () => {
  it("shows the not-available state to other accounts and makes no admin request", async () => {
    superuser = false;
    renderPage();
    expect(await screen.findByText("The image library is not available")).toBeVisible();
    expect(fetched().some((path) => path.startsWith("/api/admin/"))).toBe(false);
  });

  it("lists images with their kind, usage, and references", async () => {
    renderPage();
    const cover = await card("Course cover in Dutch foundations");
    expect(within(cover).getByRole("link", { name: "Dutch foundations" })).toHaveAttribute("href", "/courses/dutch");
    const lessonImage = await card("Lesson image in Dutch foundations");
    expect(within(lessonImage).getByText("Unused")).toBeVisible();
    expect(within(lessonImage).getByRole("link", { name: "3. At the market" })).toHaveAttribute("href", "/courses/dutch/lessons/market");
    const mask = await card("Dialogue mask in Dutch foundations");
    expect(within(mask).getByRole("link", { name: "Buying bread" })).toHaveAttribute("href", "/courses/dutch/lessons/market/dialogues/b1");
    expect(within(mask).getByText("Line 2 · Bram: Dag Anna.")).toBeVisible();
    expect(within(mask).getByText("Published")).toBeVisible();
    expect(within(mask).getByText("3 × 2")).toBeVisible();
  });

  it("sends the filters to the API", async () => {
    renderPage({ kind: "dialogue", course: "c1", lesson: "l1", usage: "unused" });
    await card("Course cover in Dutch foundations");
    expect(fetched()).toContain("/api/admin/images?kind=dialogue&courseId=c1&lessonId=l1&usage=unused");
  });

  it("replaces an image after confirmation and reloads the list", async () => {
    renderPage();
    const mask = await card("Dialogue mask in Dutch foundations");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "mask.png", { type: "image/png" });
    fireEvent.change(mask.querySelector("input[type=file]")!, { target: { files: [file] } });
    expect(await screen.findByRole("dialog", { name: "Replace this image?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace everywhere" }));
    expect(await screen.findByText("Image replaced everywhere it was used.")).toBeVisible();
    const call = vi.mocked(fetch).mock.calls.find(([input]) => String(input) === "/api/admin/images/replace")!;
    const body = call[1]!.body as FormData;
    expect(body.get("key")).toBe(images[2]!.key);
    expect(body.get("image")).toBe(file);
    await waitFor(() => expect(fetched().filter((path) => path === "/api/admin/images").length).toBe(2));
  });

  it("shows why a replacement failed and keeps the dialog open", async () => {
    replaceStatus = 404;
    renderPage();
    const mask = await card("Dialogue mask in Dutch foundations");
    fireEvent.change(mask.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "mask.png", { type: "image/png" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Replace everywhere" }));
    expect(await screen.findByText("This image no longer exists. Reload the list.")).toBeVisible();
  });
});

describe("validateImagesSearch", () => {
  it("keeps known filters and drops a lesson without its course", () => {
    expect(validateImagesSearch({ kind: "mask", course: "c1", lesson: "l1", usage: "used" })).toEqual({ kind: "mask", course: "c1", lesson: "l1", usage: "used" });
    expect(validateImagesSearch({ kind: "banner", lesson: "l1", usage: "maybe" })).toEqual({});
  });
});

describe("prepareReplacement", () => {
  it("sends masks and portraits as chosen and refuses ones over the upload limit", async () => {
    const small = new File(["x"], "p.png", { type: "image/png" });
    expect(await prepareReplacement({ kind: "portrait" }, small)).toBe(small);
    const large = new File([new Uint8Array(1_048_577)], "p.png", { type: "image/png" });
    await expect(prepareReplacement({ kind: "mask" }, large)).rejects.toThrow("IMAGE_SIZE_INVALID");
    await expect(prepareReplacement({ kind: "mask" }, new File(["x"], "p.gif", { type: "image/gif" }))).rejects.toThrow("IMAGE_TYPE_INVALID");
  });
});
