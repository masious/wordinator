import { env } from "cloudflare:test";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@wordinator/contracts/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiRequestError, AiUnavailableError, azureChatUrl, completeChat, streamChat, type AiChatRequest, type AiEnv, type StreamChatOptions } from "../src/ai";
import { resetDatabase, seedUser } from "./courseApi";

// The provider layer (C14f, docs/ai-tutor.md#providers-and-fallback) against stubbed fetch and a stubbed AI binding; no
// real provider is ever called.

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

function stubBinding(run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>) {
  const calls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
  const binding: WorkersAiBinding = { run: async (model, inputs) => { calls.push({ model, inputs }); return run(model, inputs); } };
  return { calls, binding };
}

const unusedBinding = () => stubBinding(async () => { throw new Error("binding should not be called"); });
const AZURE_ENDPOINT = "https://wordinator-test.services.ai.azure.com";
const fullEnv = (binding: WorkersAiBinding): AiEnv => ({ OPENROUTER_API_KEY: "or-test-key", AZURE_AI_ENDPOINT: AZURE_ENDPOINT, AZURE_AI_KEY: "az-test-key", AI: binding });

let userId: string;
const options = (aiEnv: AiEnv, fetcher: typeof fetch, extra: Partial<StreamChatOptions> = {}): StreamChatOptions => ({
  env: aiEnv, db: env.DB, settings: DEFAULT_AI_SETTINGS, userId, conversationId: "conversation-1", turnStart: true, fetcher, ...extra,
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
    for await (const item of streamChat(request, options(fullEnv(unusedBinding().binding), fetcher))) events.push(item);
    expect(events).toEqual([
      { type: "text", delta: "Hal" }, { type: "text", delta: "lo!" },
      { type: "tool_call", call: { id: "call_a", name: "get_lesson", arguments: "{\"lessonId\":\"l1\"}" } },
      { type: "done", provider: "openrouter", model: DEFAULT_AI_SETTINGS.providers[0]!.model, finishReason: "tool_calls", usage: { tokensIn: 120, tokensOut: 20, costUsd: 0.000042 } },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer or-test-key");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: DEFAULT_AI_SETTINGS.providers[0]!.model, stream: true, stream_options: { include_usage: true }, tool_choice: "auto" });
    expect(body.tools).toEqual([{ type: "function", function: request.tools![0] }]);
    expect(await usageRows()).toEqual([
      { provider: "openrouter", model: DEFAULT_AI_SETTINGS.providers[0]!.model, turn_start: 1, tokens_in: 120, tokens_out: 20, cost_microusd: 42, ok: 1, conversation_id: "conversation-1" },
    ]);
  });

  it("parses Azure AI Foundry's stream, with an empty first chunk and usage on a choice-less chunk", async () => {
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [DEFAULT_AI_SETTINGS.providers[2]!, { ...DEFAULT_AI_SETTINGS.providers[0]!, enabled: false }, { ...DEFAULT_AI_SETTINGS.providers[1]!, enabled: false }] };
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

  it("parses Workers AI's native stream with a complete tool call", async () => {
    const { calls, binding } = stubBinding(async () => sseStream([
      event({ response: "Goed", p: "abc" }), event({ response: " zo." }),
      event({ response: "", tool_calls: [{ name: "get_lesson", arguments: { lessonId: "l3" } }] }),
      event({ response: "", usage: { prompt_tokens: 50, completion_tokens: 8, total_tokens: 58 } }),
      "data: [DONE]\n\n",
    ]));
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [DEFAULT_AI_SETTINGS.providers[1]!, DEFAULT_AI_SETTINGS.providers[0]!, DEFAULT_AI_SETTINGS.providers[2]!] };
    const result = await completeChat(request, options({ AI: binding }, stubFetch(() => { throw new Error("no fetch"); }).fetcher, { settings }));
    expect(result).toMatchObject({ text: "Goed zo.", provider: "workers_ai", model: "@cf/meta/llama-4-scout-17b-16e-instruct", usage: { tokensIn: 50, tokensOut: 8, costUsd: null } });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ name: "get_lesson", arguments: "{\"lessonId\":\"l3\"}" });
    expect(result.toolCalls[0]!.id).toMatch(/^call_/);
    expect(calls[0]!.model).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    expect(calls[0]!.inputs).toMatchObject({ stream: true, messages: request.messages, tools: [{ type: "function", function: request.tools![0] }] });
    // 50 × 0.27 + 8 × 0.85 = 20.3 micro-USD.
    expect((await usageRows())[0]).toMatchObject({ provider: "workers_ai", cost_microusd: 20, ok: 1 });
  });

  it("parses Workers AI's OpenAI-format stream", async () => {
    const { binding } = stubBinding(async () => sseStream([
      event(delta({ content: "Hoi" })),
      event(delta({ tool_calls: [{ index: 0, id: "chatcmpl-tool-1", type: "function", function: { name: "get_lesson", arguments: "{\"lessonId\": \"l4\"}" } }] })),
      event({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 7, completion_tokens: 2 } }),
      "data: [DONE]\n\n",
    ]));
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [DEFAULT_AI_SETTINGS.providers[1]!, { ...DEFAULT_AI_SETTINGS.providers[0]!, enabled: false }, { ...DEFAULT_AI_SETTINGS.providers[2]!, enabled: false }] };
    const result = await completeChat(request, options({ AI: binding }, fetch, { settings }));
    expect(result).toMatchObject({ text: "Hoi", finishReason: "tool_calls", usage: { tokensIn: 7, tokensOut: 2 } });
    expect(result.toolCalls).toEqual([{ id: "chatcmpl-tool-1", name: "get_lesson", arguments: "{\"lessonId\": \"l4\"}" }]);
  });

  it("reads a Workers AI chunk that carries both formats once", async () => {
    const both = (response: string, choiceDelta: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      event({ response, ...extra, choices: [{ index: 0, delta: choiceDelta }] });
    const { binding } = stubBinding(async () => sseStream([
      both("You", { content: "You" }), both(" **did**", { content: " **did**" }),
      both("", { tool_calls: [{ index: 0, id: "chatcmpl-tool-2", type: "function", function: { name: "get_lesson", arguments: "{\"lessonId\":\"l5\"}" } }] },
        { tool_calls: [{ name: "get_lesson", arguments: { lessonId: "l5" } }] }),
      "data: [DONE]\n\n",
    ]));
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [DEFAULT_AI_SETTINGS.providers[1]!, { ...DEFAULT_AI_SETTINGS.providers[0]!, enabled: false }, { ...DEFAULT_AI_SETTINGS.providers[2]!, enabled: false }] };
    const result = await completeChat(request, options({ AI: binding }, fetch, { settings }));
    expect(result.text).toBe("You **did**");
    expect(result.toolCalls).toEqual([{ id: "chatcmpl-tool-2", name: "get_lesson", arguments: "{\"lessonId\":\"l5\"}" }]);
  });
});

describe("fallback", () => {
  it("moves through the configured order on 429 and a busy binding, recording every attempt", async () => {
    const { calls, fetcher } = stubFetch((url) => url.startsWith("https://openrouter.ai")
      ? new Response(JSON.stringify({ error: { code: 429, message: "Rate limited" } }), { status: 429 })
      : sseResponse(openAiTextStream("Antwoord")));
    const workers = stubBinding(async () => { throw new Error("3040: Capacity temporarily exceeded, please try again."); });
    const result = await completeChat(request, options(fullEnv(workers.binding), fetcher));
    expect(result).toMatchObject({ text: "Antwoord", provider: "azure" });
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["openrouter.ai", "wordinator-test.services.ai.azure.com"]);
    expect(workers.calls).toHaveLength(1);
    expect((await usageRows()).map((row) => [row.provider, row.ok, row.turn_start])).toEqual([["openrouter", 0, 1], ["workers_ai", 0, 0], ["azure", 1, 0]]);
    expect(logEvents("ai.fallback")).toEqual([
      expect.objectContaining({ from: "openrouter", to: "workers_ai", reason: "status", status: 429 }),
      expect.objectContaining({ from: "workers_ai", to: "azure", reason: "status" }),
    ]);
    expect(logEvents("ai.request").map((line) => [line.provider, line.ok])).toEqual([["openrouter", false], ["workers_ai", false], ["azure", true]]);
    expect(logEvents("ai.request")[2]).toMatchObject({ model: "gpt-4.1-mini", status: 200, tokensIn: 10, tokensOut: 3 });
    expect(typeof logEvents("ai.request")[2]!.durationMs).toBe("number");
    const all = logs.join("\n");
    for (const secret of [PROMPT, "Antwoord", "or-test-key", "az-test-key", "get_lesson"]) expect(all).not.toContain(secret);
  });

  it("falls back on a 5xx", async () => {
    const { fetcher } = stubFetch(() => new Response("upstream error", { status: 503 }));
    const workers = stubBinding(async () => sseStream(openAiTextStream("Van Workers AI")));
    const result = await completeChat(request, options(fullEnv(workers.binding), fetcher));
    expect(result).toMatchObject({ text: "Van Workers AI", provider: "workers_ai" });
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["openrouter", 0], ["workers_ai", 1]]);
  });

  it("falls back when a provider times out before answering or stalls before its first event", async () => {
    const { fetcher } = stubFetch((url, init) => url.startsWith("https://openrouter.ai")
      ? new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))
      : sseResponse(openAiTextStream("Eindelijk")));
    const stalled = stubBinding(async () => new ReadableStream<Uint8Array>({ start() {} }));
    const result = await completeChat(request, options(fullEnv(stalled.binding), fetcher, { firstEventTimeoutMs: 30 }));
    expect(result).toMatchObject({ text: "Eindelijk", provider: "azure" });
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["openrouter", 0], ["workers_ai", 0], ["azure", 1]]);
    expect(logEvents("ai.request").slice(0, 2).map((line) => line.reason)).toEqual(["timeout", "timeout"]);
  });

  it("falls back on a mid-stream error that arrives before any text", async () => {
    const { fetcher } = stubFetch((url) => url.startsWith("https://openrouter.ai")
      ? sseResponse([": OPENROUTER PROCESSING\n\n", event({ id: "x", object: "chat.completion.chunk", error: { code: 502, message: "Provider disconnected" }, choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }] })])
      : sseResponse(openAiTextStream("Azure")));
    const result = await completeChat(request, options(fullEnv(unusedBinding().binding), fetcher, { settings: { ...DEFAULT_AI_SETTINGS, providers: [DEFAULT_AI_SETTINGS.providers[0]!, { ...DEFAULT_AI_SETTINGS.providers[1]!, enabled: false }, DEFAULT_AI_SETTINGS.providers[2]!] } }));
    expect(result.provider).toBe("azure");
  });

  it("does not fall back on a 400 and reports the request failed", async () => {
    const { calls, fetcher } = stubFetch(() => new Response(JSON.stringify({ error: { code: 400, message: "Invalid tools" } }), { status: 400 }));
    const workers = unusedBinding();
    const error = await completeChat(request, options(fullEnv(workers.binding), fetcher)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiRequestError);
    expect(error).toMatchObject({ code: "AI_REQUEST_FAILED", status: 400, partial: false });
    expect(calls).toHaveLength(1);
    expect(workers.calls).toHaveLength(0);
    expect((await usageRows()).map((row) => [row.provider, row.ok, row.turn_start])).toEqual([["openrouter", 0, 1]]);
    expect(logEvents("ai.fallback")).toEqual([]);
  });

  it("does not fall back once text has been streamed", async () => {
    const { calls, fetcher } = stubFetch(() => sseResponse([event(delta({ content: "Half" })), event({ error: { code: 502, message: "gone" }, choices: [{ index: 0, delta: {}, finish_reason: "error" }] })]));
    const seen: string[] = [];
    const error = await (async () => {
      for await (const item of streamChat(request, options(fullEnv(unusedBinding().binding), fetcher))) if (item.type === "text") seen.push(item.delta);
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
    const workers = stubBinding(async () => { throw new Error("3040: Capacity temporarily exceeded"); });
    await expect(completeChat(request, options(fullEnv(workers.binding), fetcher))).rejects.toBeInstanceOf(AiUnavailableError);
    expect((await usageRows()).map((row) => [row.provider, row.ok])).toEqual([["openrouter", 0], ["workers_ai", 0], ["azure", 0]]);
  });

  it("does not fall back when the binding refuses the input", async () => {
    const workers = stubBinding(async () => { throw new Error("5006: Error: oneOf at '/' not met, Invalid input"); });
    const { calls, fetcher } = stubFetch(() => sseResponse(openAiTextStream("never")));
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, providers: [DEFAULT_AI_SETTINGS.providers[1]!, DEFAULT_AI_SETTINGS.providers[0]!, DEFAULT_AI_SETTINGS.providers[2]!] };
    await expect(completeChat(request, options(fullEnv(workers.binding), fetcher, { settings }))).rejects.toMatchObject({ code: "AI_REQUEST_FAILED", status: 400 });
    expect(calls).toHaveLength(0);
  });
});
