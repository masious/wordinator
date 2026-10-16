import type { AiProvider, AiSettings } from "@wordinator/contracts/ai";
import { abortable, sseJson } from "./stream";

// The three chat-completions targets (docs/ai-tutor.md#providers-and-fallback). Each opens one streamed request and hands
// back its JSON chunks; the client in `client.ts` owns fallback, metering, and logging. Formats verified in AI_PLAN.md (C14f
// notes).

export type AiEnv = Pick<Env, "AI" | "OPENROUTER_API_KEY" | "AZURE_AI_ENDPOINT" | "AZURE_AI_KEY">;

// OpenAI chat-completions messages and tools, the shape every target accepts.
export type AiChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };
export type AiToolDefinition = { name: string; description: string; parameters: Record<string, unknown> };
export type AiChatRequest = { messages: AiChatMessage[]; tools?: AiToolDefinition[]; maxTokens?: number; temperature?: number };

export type OpenResult =
  | { ok: true; status: number; chunks: AsyncIterable<unknown> | Iterable<unknown> }
  | { ok: false; status: number | null; retryable: boolean };

export type ProviderTarget = { provider: AiProvider; model: string; open(request: AiChatRequest, signal: AbortSignal): Promise<OpenResult> };

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// `429`, `5xx`, and `408` move the turn on, and so do `401`/`403` (a refused key is that provider's configuration, not the
// request). Any other status is a request the next provider would refuse too.
export const isRetryableStatus = (status: number | null) =>
  status === null || status === 408 || status === 429 || status === 401 || status === 403 || status >= 500;

// Accepts the resource URL (`https://name.services.ai.azure.com` or `https://name.openai.azure.com`), its `/openai/v1`
// base URL, or the full chat-completions URL.
export function azureChatUrl(endpoint: string) {
  const base = endpoint.trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/openai/v1")) return `${base}/chat/completions`;
  return `${base}/openai/v1/chat/completions`;
}

const openAiTools = (tools: AiToolDefinition[] | undefined) =>
  tools?.length ? tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) : undefined;

function openAiBody(model: string, request: AiChatRequest) {
  const tools = openAiTools(request.tools);
  return {
    model, messages: request.messages, stream: true, stream_options: { include_usage: true },
    ...(tools ? { tools, tool_choice: "auto" } : {}),
    ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
  };
}

function httpTarget(provider: AiProvider, model: string, url: string, headers: Record<string, string>, fetcher: typeof fetch): ProviderTarget {
  return {
    provider, model,
    async open(request, signal) {
      const response = await fetcher(url, {
        method: "POST", signal,
        headers: { ...headers, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(openAiBody(model, request)),
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return { ok: false, status: response.status, retryable: isRetryableStatus(response.status) };
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        // A provider that ignored `stream` answered with one JSON completion.
        const json: unknown = await response.json();
        return { ok: true, status: response.status, chunks: [json] };
      }
      return { ok: true, status: response.status, chunks: sseJson(response.body, signal) };
    },
  };
}

// Workers AI through the `AI` binding: OpenAI-format messages and tools with `stream: true`, which resolves to an event
// stream. The binding takes no abort signal, so the call and every read race the signal instead. A thrown binding error
// carries no HTTP status; it is retryable unless it says the input was invalid.
function workersAiTarget(model: string, binding: WorkersAiBinding): ProviderTarget {
  return {
    provider: "workers_ai", model,
    async open(request, signal) {
      const tools = openAiTools(request.tools);
      let result: unknown;
      try {
        result = await abortable(binding.run(model, {
          messages: request.messages, stream: true,
          ...(tools ? { tools } : {}),
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        }), signal);
      } catch (error) {
        if (signal.aborted) throw error;
        const message = error instanceof Error ? error.message : "";
        const invalid = /invalid input|input validation|\b(5006|5007|8001)\b/i.test(message);
        return { ok: false, status: invalid ? 400 : null, retryable: !invalid };
      }
      if (result instanceof ReadableStream) return { ok: true, status: 200, chunks: sseJson(result as ReadableStream<Uint8Array>, signal) };
      if (result instanceof Response) {
        if (!result.ok || !result.body) return { ok: false, status: result.status, retryable: isRetryableStatus(result.status) };
        return { ok: true, status: result.status, chunks: sseJson(result.body, signal) };
      }
      return { ok: true, status: 200, chunks: [result] };
    },
  };
}

// The enabled providers that have credentials, in the configured order: what a learner may choose for a conversation.
export function availableProviders(env: AiEnv, settings: AiSettings): Array<{ provider: AiProvider; model: string }> {
  return settings.providers.filter(({ provider, enabled }) => enabled && (
    provider === "openrouter" ? Boolean(env.OPENROUTER_API_KEY)
      : provider === "workers_ai" ? Boolean(env.AI)
      : Boolean(env.AZURE_AI_ENDPOINT && env.AZURE_AI_KEY)
  )).map(({ provider, model }) => ({ provider, model }));
}

// The settings with a conversation's chosen provider moved to the front; the rest keep their order as the fallback. A choice
// that is no longer enabled changes nothing.
export function preferProvider(settings: AiSettings, provider: AiProvider | null): AiSettings {
  const index = provider ? settings.providers.findIndex((item) => item.provider === provider && item.enabled) : -1;
  if (index <= 0) return settings;
  return { ...settings, providers: [settings.providers[index]!, ...settings.providers.filter((_, position) => position !== index)] };
}

// The enabled targets that have credentials, in the configured order.
export function configuredTargets(env: AiEnv, settings: AiSettings, fetcher: typeof fetch = fetch): ProviderTarget[] {
  const targets: ProviderTarget[] = [];
  for (const { provider, enabled, model } of settings.providers) {
    if (!enabled) continue;
    if (provider === "openrouter" && env.OPENROUTER_API_KEY) {
      targets.push(httpTarget(provider, model, OPENROUTER_URL, { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "X-Title": "Wordinator" }, fetcher));
    } else if (provider === "workers_ai" && env.AI) {
      targets.push(workersAiTarget(model, env.AI));
    } else if (provider === "azure" && env.AZURE_AI_ENDPOINT && env.AZURE_AI_KEY) {
      targets.push(httpTarget(provider, model, azureChatUrl(env.AZURE_AI_ENDPOINT), { "api-key": env.AZURE_AI_KEY }, fetcher));
    }
  }
  return targets;
}
