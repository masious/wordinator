import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import type { ActivityDescriptor, ActivityType, LessonActivityRun } from "@wordinator/contracts/lesson-activities";
import { LessonActivityPage, type LessonActivityPageProps } from "./LessonActivityPage";

const groupId = "20000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const activityId = "60000000-0000-4000-8000-000000000001";
const runId = "70000000-0000-4000-8000-000000000001";
const fingerprint = "a".repeat(64);
const uuid = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const storyDescriptor: ActivityDescriptor = {
  sourceId: "section-story", sourceKind: "section", sourceLabel: "Story", returnBlockId: uuid(1), returnHeadingId: uuid(2), practiceBlockId: null, fingerprint,
  activityTypes: ["story_comprehension", "story_summary", "tricky_grammar"],
};
const introDescriptor: ActivityDescriptor = {
  sourceId: "intro", sourceKind: "section", sourceLabel: "Introduction", returnBlockId: uuid(3), returnHeadingId: null, practiceBlockId: null, fingerprint,
  activityTypes: ["story_comprehension"],
};
const summaryPayload = { type: "story_summary", recipeVersion: 1, schemaVersion: 1, image: null, pairs: [{ dutch: "Sofia koopt brood.", english: "Sofia buys bread." }, { dutch: "Zij eet het.", english: "She eats it." }], newWords: [{ term: "het brood", translation: "the bread" }] };
const descriptorList = { descriptors: [storyDescriptor, introDescriptor] };

const run = (overrides: Partial<LessonActivityRun> = {}): LessonActivityRun => ({
  id: runId, status: "active", cursor: 0, cueMode: "english", startedAt: 1, updatedAt: 1, completedAt: null, ephemeral: false, ...overrides,
});
const choice = (n: number, prompt: string) => ({
  id: uuid(100 + n), kind: "choice" as const, prompt, options: [
    { id: uuid(200 + n * 10 + 1), text: `Option A${n}` }, { id: uuid(200 + n * 10 + 2), text: `Option B${n}` }, { id: uuid(200 + n * 10 + 3), text: `Option C${n}` },
  ],
});
const storyQuestions = [1, 2, 3, 4].map((n) => choice(n, `Story question ${n}?`));
const storyActivity = (overrides: Record<string, unknown> = {}) => ({
  id: activityId, sourceId: "section-story", sourceLabel: "Story", sourceFingerprint: fingerprint,
  payload: { type: "story_comprehension", recipeVersion: 1, schemaVersion: 1, questions: storyQuestions, ...overrides },
});
const readyResponse = (overrides: { run?: Partial<LessonActivityRun>; payload?: Record<string, unknown> } = {}) => ({
  status: "ready", activity: storyActivity(overrides.payload), run: run(overrides.run), ephemeral: false,
});
const wordOrderQuestion = { id: uuid(300), kind: "word_order" as const, prompt: "Arrange the sentence.", tokens: ["Ik", "heb", "een", "hond"] };
const trickyActivity = () => ({
  id: activityId, sourceId: "section-story", sourceLabel: "Story", sourceFingerprint: fingerprint, generatedBy: "gpt-5.6-luna",
  payload: { type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, questions: [wordOrderQuestion, choice(2, "Tricky question 2?"), choice(3, "Tricky question 3?"), choice(4, "Tricky question 4?")] },
});

type Call = { method: string; path: string; body: Record<string, unknown> | null };
type Routes = {
  descriptors?: () => unknown; open?: () => unknown; status?: () => unknown; run?: (body: Record<string, unknown>) => unknown; answer?: (body: Record<string, unknown>) => unknown;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
// Serves the activity API from the given responses; every request is recorded so tests can assert what the page sent.
function serve(routes: Routes): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ method, path, body });
    const pick = (handler: (() => unknown) | undefined) => handler ? json(handler()) : json({ error: { code: "NOT_STUBBED", message: "not stubbed" } }, 500);
    if (method === "GET" && path.endsWith("/activities")) return pick(routes.descriptors);
    if (method === "POST" && path.endsWith("/activities/open")) return pick(routes.open);
    if (method === "PATCH" && path.endsWith("/run")) return json(routes.run?.(body ?? {}) ?? { error: { code: "NOT_STUBBED", message: "" } }, routes.run ? 200 : 500);
    if (method === "POST" && path.endsWith("/answers")) return json(routes.answer?.(body ?? {}) ?? { error: { code: "NOT_STUBBED", message: "" } }, routes.answer ? 200 : 500);
    if (method === "GET" && path.includes(`/activities/${activityId}`)) return pick(routes.status);
    return json({ error: { code: "NOT_STUBBED", message: path } }, 500);
  }));
  return calls;
}
const callsTo = (calls: Call[], suffix: string, method: string) => calls.filter((call) => call.method === method && call.path.endsWith(suffix));

function renderPage(overrides: Partial<LessonActivityPageProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  const props: LessonActivityPageProps = {
    groupId, courseId, courseSlug: "dutch-foundations", lessonId, lessonSlug: "lesson-title", lessonTitle: "Lesson title", accountId,
    type: "story_comprehension", sourceId: "section-story", archived: false, ...overrides,
  };
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <LessonActivityPage {...props} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  const page: ReactNode = <MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>;
  return render(page);
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Lesson activity page", () => {
  it("shows the shared generation state and resolves to the ready activity once polling succeeds", async () => {
    let polls = 0;
    const calls = serve({
      descriptors: () => descriptorList,
      open: () => ({ status: "generating", activityId, retryAfterMs: 250 }),
      status: () => { polls += 1; return polls === 1 ? { status: "generating", retryAfterMs: 250 } : readyResponse(); },
    });
    renderPage();
    expect(await screen.findByText("Preparing your activity")).toBeInTheDocument();
    expect(await screen.findByText("Story question 1?", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(callsTo(calls, "/activities/open", "POST")[0]?.body).toEqual({ sourceId: "section-story", type: "story_comprehension", expectedFingerprint: fingerprint });
  });

  it("checks a choice answer, shows feedback once, and continues to the next question", async () => {
    const answers: Record<string, unknown>[] = [];
    const calls = serve({
      descriptors: () => descriptorList,
      open: () => readyResponse(),
      run: (body) => ({ run: run({ cursor: body.action === "continue" ? 1 : 0 }) }),
      answer: (body) => { answers.push(body); return { answerId: uuid(900), itemId: uuid(101), correct: true, reference: "Option B1", explanation: "Because B is right.", pronunciation: null }; },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Option B1" }));
    const check = screen.getByRole("button", { name: "Check answer" });
    // Two quick clicks send one answer under one idempotency key.
    fireEvent.click(check); fireEvent.click(check);
    expect(await screen.findByText("Because B is right.")).toBeInTheDocument();
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ runId, itemId: uuid(101), answer: { kind: "choice", optionId: uuid(212) }, inputMode: "typed" });
    expect(typeof answers[0]?.idempotencyKey).toBe("string");
    expect(screen.getByRole("status")).toHaveTextContent("Correct");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Story question 2?")).toBeInTheDocument();
    expect(callsTo(calls, "/run", "PATCH")[0]?.body).toEqual({ action: "continue", expectedCursor: 0 });
    expect(screen.getByText("Question 2 of 4")).toBeInTheDocument();
  });

  it("checks a multiword tricky grammar answer with Enter and keeps Shift+Enter for a newline", async () => {
    const answers: Record<string, unknown>[] = [];
    serve({
      descriptors: () => descriptorList,
      open: () => ({ ...readyResponse(), activity: { ...trickyActivity(), payload: { ...trickyActivity().payload, questions: [
        { id: uuid(305), kind: "fill_in", prompt: "Complete: ___ ik de menukaart?" }, ...trickyActivity().payload.questions.slice(1),
      ] } } }),
      answer: (body) => { answers.push(body); return { answerId: uuid(901), itemId: uuid(305), correct: true, reference: null, explanation: null, pronunciation: null }; },
    });
    renderPage({ type: "tricky_grammar" });
    const field = await screen.findByRole("textbox", { name: "Your answer" });
    fireEvent.change(field, { target: { value: "Wil jij" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(answers).toHaveLength(0);
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(answers[0]).toMatchObject({ answer: { kind: "text", text: "Wil jij" } });
  });

  it("orders word tokens on the shared word-order board and submits the order as indices", async () => {
    const answers: Record<string, unknown>[] = [];
    serve({
      descriptors: () => descriptorList,
      open: () => ({ ...readyResponse(), activity: trickyActivity() }),
      answer: (body) => { answers.push(body); return { answerId: uuid(901), itemId: uuid(300), correct: true, reference: null, explanation: null, pronunciation: null }; },
    });
    renderPage({ type: "tricky_grammar" });
    await screen.findByText("Arrange the sentence.");
    // The page names the model that generated the cached content.
    expect(screen.getByText("Generated with gpt-5.6-luna")).toBeInTheDocument();
    // The board (WordOrderBoard, shared with lesson practices and the tutor) also takes drags between the placed words.
    const pool = screen.getByRole("list", { name: "Pieces" });
    const answerRow = screen.getByRole("list", { name: "Your sentence" });
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();

    for (const word of ["hond", "Ik", "heb", "een"]) fireEvent.click(within(pool).getByRole("button", { name: `Add “${word}”` }));
    expect(within(answerRow).getAllByRole("button").map((button) => button.textContent)).toEqual(["hond", "Ik", "heb", "een"]);
    // Removing a placed word returns it to the pool, so the order can be corrected before checking.
    fireEvent.click(within(answerRow).getByRole("button", { name: "Remove “een”, place 4" }));
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    fireEvent.click(within(pool).getByRole("button", { name: "Add “een”" }));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));

    await screen.findByRole("status");
    expect(answers[0]).toMatchObject({ itemId: uuid(300), answer: { kind: "word_order", order: [3, 0, 1, 2] } });
    // A correct answer reads as the green Correct badge.
    expect(within(screen.getByRole("status")).getByText("Correct")).toBeInTheDocument();
  });

  it("resumes at the server cursor instead of the first item", async () => {
    serve({ descriptors: () => descriptorList, open: () => readyResponse({ run: { cursor: 2 } }) });
    renderPage();
    expect(await screen.findByText("Story question 3?")).toBeInTheDocument();
    expect(screen.getByText("Question 3 of 4")).toBeInTheDocument();
    expect(screen.queryByText("Story question 1?")).not.toBeInTheDocument();
    // Content cached before the model was recorded says so.
    expect(screen.getByText("Model not recorded")).toBeInTheDocument();
  });

  it("reloads the lesson's activity list when the run is completed and when it is restarted", async () => {
    const calls = serve({
      descriptors: () => descriptorList,
      open: () => ({
        status: "ready", ephemeral: false, run: run(),
        activity: { id: activityId, sourceId: "section-story", sourceLabel: "Story", sourceFingerprint: fingerprint,
          payload: summaryPayload },
      }),
      run: (body) => ({ run: run({ status: body.action === "complete" ? "completed" : "active", completedAt: body.action === "complete" ? 2 : null }) }),
    });
    const listReads = () => callsTo(calls, "/activities", "GET").length;
    renderPage({ type: "story_summary" });
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(await screen.findByText("Activity complete")).toBeInTheDocument();
    await waitFor(() => expect(listReads()).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(await screen.findByRole("button", { name: "Done" })).toBeInTheDocument();
    await waitFor(() => expect(listReads()).toBe(3));
    expect(callsTo(calls, "/run", "PATCH").map((call) => call.body)).toEqual([{ action: "complete" }, { action: "restart" }]);
  });

  describe("routes each activity type to its component", () => {
    const paragraph = (n: number) => ({ id: uuid(500 + n), type: "paragraph", props: { textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: `Lesson text ${n}.`, styles: {} }], children: [] });
    const guidedStep = (n: number) => ({ blocks: [paragraph(n)], question: choice(n, `Guided question ${n}?`) });
    const payloads: Record<string, { payload: Record<string, unknown>; marker: string }> = {
      story_summary: { payload: summaryPayload, marker: "Sofia koopt brood." },
      guided_grammar: { payload: { type: "guided_grammar", recipeVersion: 1, schemaVersion: 1, steps: [guidedStep(1), guidedStep(2)], followUps: [] }, marker: "Guided question 1?" },
      read_aloud: { payload: { type: "read_aloud", recipeVersion: 1, schemaVersion: 1, lines: [{ id: uuid(601), index: 0, speaker: "Dirk", dutchText: "Goedemorgen, Dirk." }] }, marker: "Read this line aloud" },
      speak_from_english: { payload: { type: "speak_from_english", recipeVersion: 1, schemaVersion: 1, lines: [{ id: uuid(602), index: 0, speaker: "Dirk", englishText: "Good morning, Dirk.", dutchText: null }] }, marker: "Say this in Dutch" },
    };
    for (const [type, { payload, marker }] of Object.entries(payloads)) {
      it(`${type}`, async () => {
        serve({
          descriptors: () => ({ descriptors: [{ ...storyDescriptor, activityTypes: [type] }] }),
          open: () => ({ status: "ready", ephemeral: false, run: run(), activity: { id: activityId, sourceId: "section-story", sourceLabel: "Story", sourceFingerprint: fingerprint, payload } }),
        });
        renderPage({ type: type as ActivityType });
        expect(await screen.findByText(marker)).toBeInTheDocument();
      });
    }
  });

  it("shows only the changed metrics on completion, then Up next and the back links", async () => {
    serve({
      descriptors: () => descriptorList,
      open: () => ({ status: "ready", ephemeral: false, run: run(), activity: { id: activityId, sourceId: "section-story", sourceLabel: "Story", sourceFingerprint: fingerprint, payload: summaryPayload } }),
      run: () => ({ run: run({ status: "completed", completedAt: 2 }), metrics: [{ key: "lesson_reading", before: 0.2, after: 0.5 }, { key: "lesson_grammar", before: 0.1, after: 0.1 }] }),
    });
    renderPage({ type: "story_summary" });
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(await screen.findByRole("progressbar", { name: "+30% of this lesson's reading" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { name: /grammar/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Story comprehension · Introduction/ })).toBeInTheDocument();
  });

  describe("Skip this activity", () => {
    const grammarDescriptor: ActivityDescriptor = { ...introDescriptor, sourceId: "grammar", sourceLabel: "Grammar", activityTypes: ["guided_grammar", "story_comprehension"] };
    const skipList = (completed: unknown[] = []) => ({ descriptors: [storyDescriptor, grammarDescriptor], completed });
    const done = (type: string) => ({ sourceId: "grammar", type, correct: null, total: null, completedAt: null });

    it("links to the next not-completed suggestion and sends nothing", async () => {
      const calls = serve({ descriptors: () => skipList([done("guided_grammar")]), open: () => readyResponse() });
      renderPage();
      const link = await screen.findByRole("link", { name: "Skip this activity, go to Story comprehension · Grammar" });
      expect(link).toHaveAttribute("href", "/courses/dutch-foundations/lessons/lesson-title/activities/grammar/story_comprehension");
      expect(calls.filter((call) => call.method !== "GET" && !call.path.endsWith("/activities/open"))).toHaveLength(0);
    });

    it("falls back to the lesson when every suggestion is done", async () => {
      serve({ descriptors: () => skipList([done("guided_grammar"), done("story_comprehension")]), open: () => readyResponse() });
      renderPage();
      const link = await screen.findByRole("link", { name: "Skip this activity, go to Back to lesson" });
      expect(link).toHaveAttribute("href", expect.stringContaining("/courses/dutch-foundations/lessons/lesson-title"));
    });

    it("is absent once the run is completed", async () => {
      serve({ descriptors: () => skipList(), open: () => readyResponse({ run: { status: "completed", completedAt: 2 } }) });
      renderPage();
      expect(await screen.findByText("Activity complete")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Skip this activity/ })).toBeNull();
    });
  });

  it("renders the unavailable state with a return link for an unknown activity type", async () => {
    serve({ descriptors: () => descriptorList });
    renderPage({ type: null });
    expect(await screen.findByText("This activity is not available for this section.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to/ })).toBeInTheDocument();
  });

  it("keeps the return link while the sources load", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderPage();
    const link = await screen.findByRole("link", { name: "Back to Lesson title" });
    expect(link).toHaveAttribute("href", "/courses/dutch-foundations/lessons/lesson-title");
  });

  it("keeps the return link on an error state and points it at the section's heading", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return json({ error: { code: "ACTIVITY_GENERATION_FAILED", message: "No." } }, 503);
      return json(descriptorList);
    }));
    renderPage();
    const link = await screen.findByRole("link", { name: "Back to Story" });
    expect(link).toHaveAttribute("href", `/courses/dutch-foundations/lessons/lesson-title#${uuid(2)}`);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("links the return to the block anchor when the section has no heading anchor", async () => {
    serve({ descriptors: () => descriptorList, open: () => readyResponse() });
    renderPage({ sourceId: "intro" });
    const link = await screen.findByRole("link", { name: "Back to Introduction" });
    expect(link).toHaveAttribute("href", `/courses/dutch-foundations/lessons/lesson-title#${uuid(3)}`);
  });
});
