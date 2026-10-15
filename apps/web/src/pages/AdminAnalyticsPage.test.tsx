import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { DEFAULT_AI_SETTINGS } from "@wordinator/contracts/ai";
import type { AdminAnalyticsRange } from "@wordinator/contracts/admin";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { AdminAnalyticsPage, checkAiSettingsDraft } from "./AdminAnalyticsPage";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
let superuser = true;
let saveStatus = 200;

const session = () => ({
  status: "signedIn",
  user: { id: userId, displayName: "Ada", username: "ada", avatarUrl: null, mustChangePassword: false, onboardingComplete: true, isSuperuser: superuser },
  groups: [{ id: groupId, name: "Library", language: "nl", role: "creator", icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [], requests: [],
});
const days = (count: number) => Array.from({ length: count }, (_, index) => new Date(Date.UTC(2026, 9, 16 - count + 1 + index)).toISOString().slice(0, 10));
const range = (count: number) => { const list = days(count); return { days: count, from: list[0]!, to: list.at(-1)! }; };
const learningCounts = (drill: number) => ({ lessonsCompleted: 1, drillReviews: drill, practiceAttempts: { lesson: 2, aiChat: 0, aiPractice: 1 }, pronunciationAttempts: 0 });
const learning = (count: number) => ({
  ...range(count),
  daily: days(count).map((day, index) => ({ day, activeAccounts: index === count - 1 ? 2 : 0, ...learningCounts(index === count - 1 ? 1234 : 0) })),
  accounts: [{ userId, username: "ada", activeDays: 1, ...learningCounts(1234) }],
});
const ai = (count: number) => {
  const zero = { turns: 0, requests: 0, failures: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0 };
  const used = { turns: 3, requests: 4, failures: 1, tokensIn: 1500, tokensOut: 300, costMicroUsd: 1_250_000 };
  return { ...range(count), daily: days(count).map((day, index) => ({ day, ...(index === count - 1 ? used : zero) })), accounts: [{ userId, username: "ada", ...used }], models: [{ provider: "azure", model: "gpt-4.1-mini", ...used }] };
};
const speech = (count: number) => {
  const used = { requests: 2, characters: 240, cacheHits: 1, azureCalls: 1, azureCharacters: 120 };
  return { ...range(count), daily: days(count).map((day) => ({ day, ...used })), accounts: [{ userId, username: null, ...used }] };
};

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

function Harness() {
  const [selected, setSelected] = useState<AdminAnalyticsRange>(7);
  return <AdminAnalyticsPage groupId={groupId} days={selected} onDays={setSelected} />;
}

function renderPage() {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "$", component: Harness });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/admin/analytics"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  superuser = true;
  saveStatus = 200;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return json(session());
    const analytics = /^\/api\/admin\/analytics\/(learning|ai|speech)\?days=(\d+)$/.exec(path);
    if (analytics) {
      const count = Number(analytics[2]);
      return json(analytics[1] === "learning" ? learning(count) : analytics[1] === "ai" ? ai(count) : speech(count));
    }
    if (path === "/api/admin/ai-settings" && init?.method === "PUT") {
      return saveStatus === 200 ? json(JSON.parse(String(init.body))) : json({ error: { code: "AI_SETTINGS_INVALID", message: "Invalid." } }, saveStatus);
    }
    if (path === "/api/admin/ai-settings") return json(DEFAULT_AI_SETTINGS);
    return json({ ok: true });
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const fetched = () => vi.mocked(fetch).mock.calls.map(([input]) => String(input));

describe("Analytics page", () => {
  it("shows the Learning, AI, and Speech tables and the AI settings for the superuser", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Analytics" })).toBeVisible();
    for (const title of ["Learning", "AI", "Speech", "AI settings"]) expect(screen.getByRole("heading", { name: title })).toBeVisible();
    // Figures are formatted counts and costs; the newest day comes first.
    const learningTable = (await screen.findAllByRole("table"))[0]!;
    expect(within(learningTable).getAllByRole("row")[1]).toHaveTextContent("2026-10-16");
    expect(within(learningTable).getByText("1,234")).toBeVisible();
    expect(await screen.findAllByText("$1.25")).not.toHaveLength(0);
    expect(screen.getByText("gpt-4.1-mini")).toBeVisible();
    expect(screen.getByText("(no username)")).toBeVisible();
    expect(fetched()).toEqual(expect.arrayContaining(["/api/admin/analytics/learning?days=7", "/api/admin/analytics/ai?days=7", "/api/admin/analytics/speech?days=7"]));
  });

  it("switches the range and reloads every section", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Analytics" });
    // Mantine keeps a Select's options mounted; the open one is found through the listbox its combobox controls.
    const range = screen.getByRole("combobox", { name: "Range" });
    fireEvent.click(range);
    await waitFor(() => expect(range).toHaveAttribute("aria-expanded", "true"));
    fireEvent.click(within(document.getElementById(range.getAttribute("aria-controls")!)!).getByRole("option", { name: "Last 30 days", hidden: true }));
    await waitFor(() => expect(fetched()).toEqual(expect.arrayContaining([
      "/api/admin/analytics/learning?days=30", "/api/admin/analytics/ai?days=30", "/api/admin/analytics/speech?days=30",
    ])));
    await waitFor(() => expect(within(screen.getAllByRole("table")[0]!).getAllByRole("row")).toHaveLength(1 + 30));
  });

  it("shows other accounts a not-available state and loads no analytics", async () => {
    superuser = false;
    renderPage();
    expect(await screen.findByText("Analytics is not available")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Learning" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Range" })).not.toBeInTheDocument();
    expect(fetched().some((path) => path.startsWith("/api/admin/"))).toBe(false);
  });
});

describe("AI settings form", () => {
  it("reorders providers, turns one off, changes a model and the caps, and saves the whole value", async () => {
    renderPage();
    const enabled = await screen.findByRole("checkbox", { name: "OpenRouter on" });
    fireEvent.click(enabled);
    fireEvent.click(screen.getByRole("button", { name: "Move Azure up" }));
    fireEvent.change(screen.getByLabelText("Azure model"), { target: { value: "gpt-4.1-nano" } });
    fireEvent.change(screen.getByLabelText("Daily turn cap per account"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    const put = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input) === "/api/admin/ai-settings" && init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({
      providers: [
        { provider: "openrouter", enabled: false, model: "openai/gpt-oss-120b:free" },
        { provider: "azure", enabled: true, model: "gpt-4.1-nano" },
        { provider: "workers_ai", enabled: true, model: "@cf/meta/llama-4-scout-17b-16e-instruct" },
      ],
      dailyTurnCap: 12,
      dailySpeechCharCap: 5000,
    });
    expect(screen.getByRole("button", { name: "Move OpenRouter up" })).toBeDisabled();
  });

  it("refuses to save with every provider off or a cap out of range", async () => {
    renderPage();
    for (const provider of ["OpenRouter", "Workers AI", "Azure"]) fireEvent.click(await screen.findByRole("checkbox", { name: `${provider} on` }));
    fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Turn on at least one provider.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Azure on" }));
    fireEvent.change(screen.getByLabelText("Daily speech characters per account"), { target: { value: "100001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The speech cap must be a whole number from 0 to 100,000.");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("shows the API's refusal", async () => {
    saveStatus = 400;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The settings were refused.");
  });

  it("checks drafts before saving", () => {
    const draft = { providers: DEFAULT_AI_SETTINGS.providers.map((item) => ({ ...item })), dailyTurnCap: "40", dailySpeechCharCap: "5000" };
    expect(checkAiSettingsDraft(draft)).toEqual({ settings: DEFAULT_AI_SETTINGS });
    expect(checkAiSettingsDraft({ ...draft, dailyTurnCap: "501" })).toEqual({ error: "turnCap" });
    expect(checkAiSettingsDraft({ ...draft, dailyTurnCap: "1.5" })).toEqual({ error: "turnCap" });
    expect(checkAiSettingsDraft({ ...draft, dailySpeechCharCap: "" })).toEqual({ error: "speechCap" });
    expect(checkAiSettingsDraft({ ...draft, providers: draft.providers.map((item) => ({ ...item, model: "has space" })) })).toEqual({ error: "model" });
  });
});
