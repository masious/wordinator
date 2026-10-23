import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { DEFAULT_AI_SETTINGS, type AiProviderTestResponse } from "@wordinator/contracts/ai";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { AdminAiPage, checkAiSettingsDraft } from "./AdminAiPage";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
let superuser = true;
let saveStatus = 200;
let testResult: AiProviderTestResponse = { ok: true, status: 200, latencyMs: 412, message: "OK" };
let providers = [
  { provider: "openrouter", credentialsPresent: true, endpointHost: null },
    { provider: "azure", credentialsPresent: true, endpointHost: "wordinator-foundry.services.ai.azure.com" },
];

const session = () => ({
  status: "signedIn",
  user: { id: userId, displayName: "Ada", username: "ada", avatarUrl: null, mustChangePassword: false, onboardingComplete: true, isSuperuser: superuser },
  groups: [{ id: groupId, name: "Library", language: "nl", role: "creator", icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [], requests: [],
});

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

function renderPage() {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "$", component: () => <AdminAiPage groupId={groupId} /> });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/admin/ai"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  superuser = true;
  saveStatus = 200;
  testResult = { ok: true, status: 200, latencyMs: 412, message: "OK" };
  providers = [
    { provider: "openrouter", credentialsPresent: true, endpointHost: null },
        { provider: "azure", credentialsPresent: true, endpointHost: "wordinator-foundry.services.ai.azure.com" },
  ];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return json(session());
    if (path === "/api/admin/ai-settings" && init?.method === "PUT") {
      return saveStatus === 200 ? json(JSON.parse(String(init.body))) : json({ error: { code: "AI_SETTINGS_INVALID", message: "Invalid." } }, saveStatus);
    }
    if (path === "/api/admin/ai-settings") return json(DEFAULT_AI_SETTINGS);
    if (path === "/api/admin/ai-providers") return json({ providers });
    if (path === "/api/admin/ai-providers/test") return json(testResult);
    return json({ ok: true });
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const fetched = () => vi.mocked(fetch).mock.calls.map(([input]) => String(input));
const posted = () => vi.mocked(fetch).mock.calls.filter(([input, init]) => String(input) === "/api/admin/ai-providers/test" && init?.method === "POST");
const row = async (name: string) => screen.findByRole("listitem", { name });

describe("AI providers and models page", () => {
  it("shows the not-available state to other accounts and makes no admin request", async () => {
    superuser = false;
    renderPage();
    expect(await screen.findByText("AI providers are not available")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Test connection" })).not.toBeInTheDocument();
    expect(fetched().some((path) => path.startsWith("/api/admin/"))).toBe(false);
  });

  it("shows each provider's credentials status and the Azure endpoint host", async () => {
    providers = [
      { provider: "openrouter", credentialsPresent: false, endpointHost: null },
      { provider: "azure", credentialsPresent: true, endpointHost: "wordinator-foundry.services.ai.azure.com" },
    ];
    renderPage();
    expect(await screen.findByRole("heading", { name: "AI providers and models" })).toBeVisible();
    expect(within(await row("OpenRouter")).getByText("Credentials missing")).toBeVisible();
    const azure = await row("Azure");
    expect(within(azure).getByText("Credentials set")).toBeVisible();
    expect(within(azure).getByText("Endpoint wordinator-foundry.services.ai.azure.com")).toBeVisible();
  });

  it("reorders providers, turns one off, changes a model and the caps, and saves the whole value", async () => {
    renderPage();
    const enabled = await screen.findByRole("switch", { name: "OpenRouter on" });
    fireEvent.click(enabled);
    fireEvent.click(screen.getByRole("button", { name: "Move Azure down" }));
    fireEvent.change(screen.getByLabelText("Azure model"), { target: { value: "gpt-4.1-nano" } });
    fireEvent.change(screen.getByLabelText("Daily turn cap per account"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    const put = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input) === "/api/admin/ai-settings" && init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({
      providers: [
        { provider: "openrouter", enabled: false, model: "openai/gpt-oss-120b:free" },
        { provider: "azure", enabled: true, model: "gpt-4.1-nano" },
      ],
      dailyTurnCap: 12,
      dailySpeechCharCap: 5000,
    });
    expect(screen.getByRole("button", { name: "Move OpenRouter up" })).toBeDisabled();
  });

  it("refuses to save with every provider off or a cap out of range", async () => {
    renderPage();
    for (const provider of ["OpenRouter", "Azure"]) fireEvent.click(await screen.findByRole("switch", { name: `${provider} on` }));
    fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Turn on at least one provider.");
    fireEvent.click(screen.getByRole("switch", { name: "Azure on" }));
    fireEvent.change(screen.getByLabelText("Daily speech characters per account"), { target: { value: "100001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The speech cap must be a whole number from 0 to 100,000.");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("shows the API's refusal when saving", async () => {
    saveStatus = 400;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Save AI settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The settings were refused.");
  });
});

describe("connection test", () => {
  it("tests the row's current model and shows the status and latency inline", async () => {
    renderPage();
    const openrouter = await row("OpenRouter");
    fireEvent.click(within(openrouter).getByRole("button", { name: "Test connection" }));
    expect(await within(openrouter).findByText("Connected in 412 ms (HTTP 200). Reply: OK")).toBeVisible();
    expect(within(openrouter).getByText("Connected in 412 ms (HTTP 200). Reply: OK").closest("p")).toHaveAttribute("aria-live", "polite");
    expect(posted()).toHaveLength(1);
    expect(JSON.parse(String(posted()[0]![1]!.body))).toEqual({ provider: "openrouter", model: "openai/gpt-oss-120b:free" });
  });

  it("uses an edited model that is not saved yet", async () => {
    renderPage();
    const azure = await row("Azure");
    fireEvent.change(within(azure).getByLabelText("Azure model"), { target: { value: "gpt-4.1-nano" } });
    fireEvent.click(within(azure).getByRole("button", { name: "Test connection" }));
    await within(azure).findByText("Connected in 412 ms (HTTP 200). Reply: OK");
    expect(JSON.parse(String(posted()[0]![1]!.body))).toEqual({ provider: "azure", model: "gpt-4.1-nano" });
  });

  it("shows a refusal with the provider's message and its status", async () => {
    testResult = { ok: false, status: 404, latencyMs: 85, message: "This model is unavailable for this account." };
    renderPage();
    const openrouter = await row("OpenRouter");
    fireEvent.click(within(openrouter).getByRole("button", { name: "Test connection" }));
    const outcome = await within(openrouter).findByText("Not connected: HTTP 404 after 85 ms. This model is unavailable for this account.");
    expect(outcome).toHaveAttribute("data-state", "failed");
    expect(outcome.closest("p")).toHaveAttribute("aria-live", "polite");
  });

  it("shows a failure without an HTTP status", async () => {
    testResult = { ok: false, status: null, latencyMs: 20000, message: "The provider did not answer within 20 seconds." };
    renderPage();
    const azure = await row("Azure");
    fireEvent.click(within(azure).getByRole("button", { name: "Test connection" }));
    expect(await within(azure).findByText("Not connected after 20000 ms. The provider did not answer within 20 seconds.")).toBeVisible();
  });

  it("shows the test could not run when the request fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/ai-providers/test") return json({ error: { code: "AUTH_REQUIRED", message: "Sign in." } }, 401);
      if (String(input) === "/api/session") return json(session());
      return json(String(input) === "/api/admin/ai-providers" ? { providers } : DEFAULT_AI_SETTINGS);
    });
    renderPage();
    const openrouter = await row("OpenRouter");
    fireEvent.click(within(openrouter).getByRole("button", { name: "Test connection" }));
    expect(await within(openrouter).findByText("The test could not run. Try again.")).toBeVisible();
  });

  it("refuses an invalid model ID without sending a request", async () => {
    renderPage();
    const openrouter = await row("OpenRouter");
    fireEvent.change(within(openrouter).getByLabelText("OpenRouter model"), { target: { value: "has space" } });
    fireEvent.click(within(openrouter).getByRole("button", { name: "Test connection" }));
    expect(await within(openrouter).findByText("Enter a valid model ID before testing.")).toBeVisible();
    expect(posted()).toHaveLength(0);
  });

  it("clears an earlier result when that row's model changes", async () => {
    renderPage();
    const openrouter = await row("OpenRouter");
    fireEvent.click(within(openrouter).getByRole("button", { name: "Test connection" }));
    await within(openrouter).findByText("Connected in 412 ms (HTTP 200). Reply: OK");
    fireEvent.change(within(openrouter).getByLabelText("OpenRouter model"), { target: { value: "vendor/other:free" } });
    await waitFor(() => expect(within(openrouter).queryByText("Connected in 412 ms (HTTP 200). Reply: OK")).not.toBeInTheDocument());
  });
});

describe("AI settings draft", () => {
  it("checks drafts before saving", () => {
    const draft = { providers: DEFAULT_AI_SETTINGS.providers.map((item) => ({ ...item })), dailyTurnCap: "40", dailySpeechCharCap: "5000" };
    expect(checkAiSettingsDraft(draft)).toEqual({ settings: DEFAULT_AI_SETTINGS });
    expect(checkAiSettingsDraft({ ...draft, dailyTurnCap: "501" })).toEqual({ error: "turnCap" });
    expect(checkAiSettingsDraft({ ...draft, dailyTurnCap: "1.5" })).toEqual({ error: "turnCap" });
    expect(checkAiSettingsDraft({ ...draft, dailySpeechCharCap: "" })).toEqual({ error: "speechCap" });
    expect(checkAiSettingsDraft({ ...draft, providers: draft.providers.map((item) => ({ ...item, model: "has space" })) })).toEqual({ error: "model" });
  });
});
