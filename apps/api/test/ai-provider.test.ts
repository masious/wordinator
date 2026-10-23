import { env } from "cloudflare:test";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@wordinator/contracts/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiRequestError, AiUnavailableError, azureChatUrl, completeChat, streamChat, type AiChatRequest, type AiEnv, type StreamChatOptions } from "../src/ai";
import { resetDatabase, seedUser } from "./courseApi";

// The default setting of one provider, by name: the default order may change.
const preset = (provider: string) => DEFAULT_AI_SETTINGS.providers.find((item) => item.provider === provider)!;
// The fallback tests walk OpenRouter, then Azure, whatever the default order is.
const ordered: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [preset("openrouter"), preset("azure")] };

// The provider layer (C14f, docs/ai-tutor.md#providers-and-fallback) against a stubbed fetch; no real provider is ever called.

const encoder = new TextEncoder();
const PROMPT = "secret prompt text";
const request: AiChatRequest = {
  messages: [{ role: "system", content: "You are a tutor." }, { role: "user", content: PROMPT }],
  tools: [{ name: "get_lesson", description: "Reads a lesson.", parameters: { type: "object", properties: { lessonId: { type: "string" } } } }],
};

// An event stream from raw event blocks, split mid-line to exercise buffering.
function sseStream(blocks: string[]) {
  const text = blocks.join("");
  const middle = Math.floor(text.length / 2);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text.slice(0, middle)));
      controller.enqueue(encoder.encode(text.slice(middle)));
      controller.close();
    },
  });
}
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const sseResponse = (blocks: string[]) => new Response(sseStream(blocks), { headers: { "content-type": "text/event-stream" } });
const delta = (value: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ choices: [{ index: 0, delta: value, finish_reason: null }], ...extra });

const openAiTextStream = (text: string, usage: Record<string, unknown> = { prompt_tokens: 10, completion_tokens: 3 }) => [
  event(delta({ role: "assistant", content: "" })), event(delta({ content: text })),
  event({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }), event({ choices: [], usage }), "data: [DONE]\n\n",
];

type Call = { url: string; init: RequestInit };
function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as typeof fetch;
  return { calls, fetcher };
}

const AZURE_ENDPOINT = "https://wordinator-test.services.ai.azure.com";
const fullEnv = (): AiEnv => ({ OPENROUTER_API_KEY: "or-test-key", AZURE_AI_ENDPOINT: AZURE_ENDPOINT, AZURE_AI_KEY: "az-test-key" });

let userId: string;
const options = (aiEnv: AiEnv, fetcher: typeof fetch, extra: Partial<StreamChatOptions> = {}): StreamChatOptions => ({
  env: aiEnv, db: env.DB, settings: ordered, userId, conversationId: "conversation-1", turnStart: true, fetcher, ...extra,
});

type UsageRow = { provider: string; model: string; turn_start: number; tokens_in: number; tokens_out: number; cost_microusd: number; ok: number; conversation_id: string | null };
const usageRows = async () => (await env.DB.prepare("SELECT provider, model, turn_start, tokens_in, tokens_out, cost_microusd, ok, conversation_id FROM ai_usage ORDER BY created_at, rowid").all<UsageRow>()).results;

let logs: string[];
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM ai_usage"), env.DB.prepare("DELETE FROM speech_usage")]);
  await resetDatabase();
  userId = await seedUser("learner");
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => { logs.push(String(line)); });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => { logs.push(String(line)); });
});
afterEach(() => vi.restoreAllMocks());

const logEvents = (name: string) => logs.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line.event === name);

describe("stream formats", () => {
  it("parses OpenRouter's stream: comments, text, split tool-call arguments, and usage with cost", async () => {
    const { calls, fetcher } = stubFetch(() => sseResponse([
      ": OPENROUTER PROCESSING\n\n",
      event(delta({ role: "assistant", content: "Hal" })), event(delta({ content: "lo!" })),
      event(delta({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "get_lesson", arguments: "{\"lesson" } }] })),
      event(delta({ tool_calls: [{ index: 0, function: { arguments: "Id\":\"l1\"}" } }] })),
      event({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }),
      event({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 120, completion_tokens: 20, cost: 0.000042 } }),
      "data: [DONE]\n\n",
    ]));
    const events = [];
    for await (const item of streamChat(request, options(fullEnv(), fetcher))) events.push(item);
    expect(events).toEqual([
      { type: "text", delta: "Hal" }, { type: "text", delta: "lo!" },
      { type: "tool_call", call: { id: "call_a", name: "get_lesson", arguments: "{\"lessonId\":\"l1\"}" } },
      { type: "done", provider: "openrouter", model: preset("openrouter").model, finishReason: "tool_calls", usage: { tokensIn: 120, tokensOut: 20, costUsd: 0.000042 } },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer or-test-key");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: preset("openrouter").model, stream: true, stream_options: { include_usage: true }, tool_choice: "auto" });
    expect(body.tools).toEqual([{ type: "function", function: request.tools![0] }]);
    expect(await usageRows()).toEqual([
      { provider: "openrouter", model: preset("openrouter").model, turn_start: 1, tokens_in: 120, tokens_out: 20, cost_microusd: 42, ok: 1, conversation_id: "conversation-1" },
    ]);
  });

  it("parses Azure AI Foundry's stream, with an empty first chunk and usage on a choice-less chunk", async () => {
    // A priced deployment, so the cost is checked too.
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [{ ...preset("azure"), model: "gpt-4.1-mini" }, { ...preset("openrouter"), enabled: false }] };
    const { calls, fetcher } = stubFetch(() => sseResponse([
      event({ choices: [], prompt_filter_results: [{ prompt_index: 0, content_filter_results: {} }] }),
      event(delta({ role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_lesson", arguments: "" } }] })),
      event(delta({ tool_calls: [{ index: 0, function: { arguments: "{\"lessonId\":" } }] })),
      event(delta({ tool_calls: [{ index: 0, function: { arguments: "\"l2\"}" } }] })),
      event(delta({ tool_calls: [{ index: 1, id: "call_2", type: "function", function: { name: "get_words", arguments: "{}" } }] })),
      event({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }),
      event({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 } }),
      "data: [DONE]\n\n",
    ]));
    const result = await completeChat(request, options({ AZURE_AI_ENDPOINT: `${AZURE_ENDPOINT}/`, AZURE_AI_KEY: "az-test-key" }, fetcher, { settings }));
    expect(result).toMatchObject({ text: "", provider: "azure", model: "gpt-4.1-mini", finishReason: "tool_calls", usage: { tokensIn: 1000, tokensOut: 500, costUsd: null } });
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "get_lesson", arguments: "{\"lessonId\":\"l2\"}" },
      { id: "call_2", name: "get_words", arguments: "{}" },
    ]);
    expect(calls[0]!.url).toBe(`${AZURE_ENDPOINT}/openai/v1/chat/completions`);
    expect(new Headers(calls[0]!.init.headers).get("api-key")).toBe("az-test-key");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBeNull();
    // gpt-4.1-mini: 1000 × 0.4 + 500 × 1.6 micro-USD.
    expect((await usageRows())[0]).toMatchObject({ provider: "azure", cost_microusd: 1200, ok: 1 });
  });

  it("builds the Azure URL from a resource, base, or full endpoint", () => {
    expect(azureChatUrl("https://r.openai.azure.com")).toBe("https://r.openai.azure.com/openai/v1/chat/completions");
    expect(azureChatUrl("https://r.services.ai.azure.com/openai/v1/")).toBe("https://r.services.ai.azure.com/openai/v1/chat/completions");
    expect(azureChatUrl("https://r.services.ai.azure.com/openai/v1/chat/completions")).toBe("https://r.services.ai.azure.com/openai/v1/chat/completions");
  });
});

describe("request bodies by model family", () => {
  // The body an HTTP target sends for one model: Azure for `gpt-5`, OpenRouter for `openai/gpt-5-mini`, and the default-style model.
  async function bodyFor(provider: "azure" | "openrouter", model: string) {
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [{ ...preset(provider), model, enabled: true }] };
    const { calls, fetcher } = stubFetch(() => sseResponse(openAiTextStream("ok")));
    const tuned: AiChatRequest = { ...request, maxTokens: 100, temperature: 0.2 };
    await completeChat(tuned, options(fullEnv(), fetcher, { settings }));
    return JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
  }

  it("sends max_completion_tokens and no temperature to a GPT-5 Azure deployment", async () => {
    const body = await bodyFor("azure", "gpt-5");
    expect(body).toMatchObject({ model: "gpt-5", max_completion_tokens: 100 });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("sends max_completion_tokens and no temperature to an OpenRouter GPT-5 model", async () => {
    const body = await bodyFor("openrouter", "openai/gpt-5-mini");
    expect(body).toMatchObject({ model: "openai/gpt-5-mini", max_completion_tokens: 100 });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("keeps max_tokens and temperature for a non-reasoning model", async () => {
    const body = await bodyFor("azure", "gpt-4.1-mini");
    expect(body).toMatchObject({ model: "gpt-4.1-mini", max_tokens: 100, temperature: 0.2 });
    expect(body).not.toHaveProperty("max_completion_tokens");
  });
});

describe("fallback", () => {
  it("moves through the configured order on 429, recording every attempt", async () => {
    const { calls, fetcher } = stubFetch((url) => url.startsWith("https://openrouter.ai")
      ? new Response(JSON.stringify({ error: { code: 429, message: "Rate limited" } }), { status: 429 })
      : sseResponse(openAiTextStream("Antwoord")));
    const result = await completeChat(request, options(fullEnv(), fetcher));
    expect(result).toMatchObject({ text: "Antwoord", provider: "azure" });
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["openrouter.ai", "wordinator-test.services.ai.azure.com"]);
    expect((await usageRows()).map((row) => [row.provider, row.ok, row.turn_start])).toEqual([["openrouter", 0, 1], ["azure", 1, 0]]);
    expect(logEvents("ai.fallback")).toEqual([expect.objectContaining({ from: "openrouter", to: "azure", reason: "status", status: 429 })]);
    expect(logEvents("ai.request").map((line) => [line.provider, line.ok])).toEqual([["openrouter", false], ["azure", true]]);
    expect(logEvents("ai.request")[1]).toMatchObject({ model: preset("azure").model, status: 200, tokensIn: 10, tokensOut: 3 });
    expect(typeof logEvents("ai.request")[1]!.durationMs).toBe("number");
    const all = logs.join("\n");
    for (const secret of [PROMPT, "Antwoord", "or-test-key", "az-test-key", "get_lesson"]) expect(all).not.toContain(secret);
  });

  it("falls back on a 5xx", async () => {
    const { fetcher } = stubFetch((url) => url.startsWith("https://openrouter.ai") ? new Response("upstream error", { status: 503 }) : sseResponse(openAiTextStream("Van Azure")));
    const result = await completeChat(request, options(fullEnv(), fetcher));
    expect(result).toMatchObject({ text: "Van Azure", provider: "azure" });
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["openrouter", 0], ["azure", 1]]);
  });

  it("falls back when a provider times out before answering", async () => {
    const { fetcher } = stubFetch((url, init) => url.startsWith("https://openrouter.ai")
      ? new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))
      : sseResponse(openAiTextStream("Eindelijk")));
    const result = await completeChat(request, options(fullEnv(), fetcher, { firstEventTimeoutMs: 30 }));
    expect(result).toMatchObject({ text: "Eindelijk", provider: "azure" });
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["openrouter", 0], ["azure", 1]]);
    expect(logEvents("ai.request")[0]!.reason).toBe("timeout");
  });

  it("falls back when a provider stalls before its first event", async () => {
    const { fetcher } = stubFetch((url) => url.startsWith("https://openrouter.ai")
      ? sseResponse(openAiTextStream("Eindelijk"))
      : new Response(new ReadableStream<Uint8Array>({ start() {} }), { headers: { "content-type": "text/event-stream" } }));
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [{ ...preset("azure"), model: "gpt-4.1-mini" }, preset("openrouter")] };
    const result = await completeChat(request, options(fullEnv(), fetcher, { settings, firstEventTimeoutMs: 30 }));
    expect(result).toMatchObject({ text: "Eindelijk", provider: "openrouter" });
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["azure", 0], ["openrouter", 1]]);
    expect(logEvents("ai.request")[0]!.reason).toBe("timeout");
  });

  it("falls back on a mid-stream error that arrives before any text", async () => {
    const { fetcher } = stubFetch((url) => url.startsWith("https://openrouter.ai")
      ? sseResponse([": OPENROUTER PROCESSING\n\n", event({ id: "x", object: "chat.completion.chunk", error: { code: 502, message: "Provider disconnected" }, choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }] })])
      : sseResponse(openAiTextStream("Azure")));
    const result = await completeChat(request, options(fullEnv(), fetcher));
    expect(result.provider).toBe("azure");
  });

  it("falls back on a 404, such as a retired model slug or a missing Azure deployment", async () => {
    const { calls, fetcher } = stubFetch((url) => url.startsWith("https://openrouter.ai")
      ? new Response(JSON.stringify({ error: { code: 404, message: "No endpoints found for retired/model" } }), { status: 404 })
      : sseResponse(openAiTextStream("Van Azure")));
    const result = await completeChat(request, options(fullEnv(), fetcher));
    expect(result).toMatchObject({ text: "Van Azure", provider: "azure" });
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["openrouter.ai", "wordinator-test.services.ai.azure.com"]);
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["openrouter", 0], ["azure", 1]]);
    expect(logEvents("ai.fallback")).toEqual([expect.objectContaining({ from: "openrouter", to: "azure", reason: "status", status: 404 })]);
  });

  it("does not fall back on a 400 and reports the request failed", async () => {
    const { calls, fetcher } = stubFetch(() => new Response(JSON.stringify({ error: { code: 400, message: "Invalid tools" } }), { status: 400 }));
    const error = await completeChat(request, options(fullEnv(), fetcher)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiRequestError);
    expect(error).toMatchObject({ code: "AI_REQUEST_FAILED", status: 400, partial: false });
    expect(calls).toHaveLength(1);
    expect((await usageRows()).map((row) => [row.provider, row.ok, row.turn_start])).toEqual([["openrouter", 0, 1]]);
    expect(logEvents("ai.fallback")).toEqual([]);
  });

  it("does not fall back once text has been streamed", async () => {
    const { calls, fetcher } = stubFetch(() => sseResponse([event(delta({ content: "Half" })), event({ error: { code: 502, message: "gone" }, choices: [{ index: 0, delta: {}, finish_reason: "error" }] })]));
    const seen: string[] = [];
    const error = await (async () => {
      for await (const item of streamChat(request, options(fullEnv(), fetcher))) if (item.type === "text") seen.push(item.delta);
    })().catch((caught: unknown) => caught);
    expect(seen).toEqual(["Half"]);
    expect(error).toMatchObject({ code: "AI_REQUEST_FAILED", partial: true });
    expect(calls).toHaveLength(1);
    expect((await usageRows()).map((row) => row.ok)).toEqual([0]);
  });

  it("skips providers without credentials or turned off, and is unavailable when none is left", async () => {
    const { calls, fetcher } = stubFetch(() => sseResponse(openAiTextStream("Alleen Azure")));
    const result = await completeChat(request, options({ AZURE_AI_ENDPOINT: AZURE_ENDPOINT, AZURE_AI_KEY: "az-test-key" }, fetcher));
    expect(result.provider).toBe("azure");
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["wordinator-test.services.ai.azure.com"]);
    expect(logEvents("ai.fallback")).toEqual([]);

    // An endpoint without its key is not a configured provider.
    await expect(completeChat(request, options({ AZURE_AI_ENDPOINT: AZURE_ENDPOINT }, fetcher))).rejects.toBeInstanceOf(AiUnavailableError);
    const onlyOpenRouterOn: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: DEFAULT_AI_SETTINGS.providers.map((item) => ({ ...item, enabled: item.provider === "openrouter" })) };
    await expect(completeChat(request, options({ AZURE_AI_ENDPOINT: AZURE_ENDPOINT, AZURE_AI_KEY: "k" }, fetcher, { settings: onlyOpenRouterOn }))).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(calls).toHaveLength(1);
    expect(await usageRows()).toHaveLength(1);
  });

  it("is unavailable when every provider fails with a retryable error", async () => {
    const { fetcher } = stubFetch(() => new Response("busy", { status: 429 }));
    await expect(completeChat(request, options(fullEnv(), fetcher))).rejects.toBeInstanceOf(AiUnavailableError);
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["openrouter", 0], ["azure", 0]]);
  });
});
