import { AI_PROVIDER_TEST_MESSAGE_MAX, type AiProviderStatus, type AiProviderTestResponse, type AiProvider, type AiSettings } from "@wordinator/contracts/ai";
import { configuredTargets, type AiEnv } from "../ai/providers";
import { ChatStreamAccumulator, abortable } from "../ai/stream";
import { logInfo } from "../logger";

// Superuser provider status and connection test (docs/settings-and-administration.md#ai-providers). The test sends one fixed
// request through one provider, with no fallback and no metering: no `ai_usage` row, nothing counted toward a cap. It answers
// the HTTP status, the latency, and the provider's own error text or the start of its reply. Keys, endpoint paths, and
// queries never leave the API.

export const AI_PROVIDER_TEST_TIMEOUT_MS = 20_000;
const TEST_PROMPT = "Reply with OK.";
const TEST_MAX_TOKENS = 5;
const REPLY_MAX = 40;
// A provider's error body is read up to this many characters; its message is what the test needs.
const ERROR_BODY_MAX = 2_048;
const CREDENTIAL_SHAPES = [/Bearer\s+\S+/gi, /\bsk-[A-Za-z0-9_-]{6,}/g, /[A-Za-z0-9+/_=-]{32,}/g];

// Presence only. The Azure endpoint's host is the one part of it the superuser may see.
export function aiProviderStatuses(env: AiEnv): AiProviderStatus[] {
  return [
    { provider: "openrouter", credentialsPresent: Boolean(env.OPENROUTER_API_KEY), endpointHost: null },
    { provider: "workers_ai", credentialsPresent: Boolean(env.AI), endpointHost: null },
    { provider: "azure", credentialsPresent: Boolean(env.AZURE_AI_ENDPOINT && env.AZURE_AI_KEY), endpointHost: endpointHost(env.AZURE_AI_ENDPOINT) },
  ];
}

// The host of an endpoint (scheme, path, query, and credentials dropped), or null when it does not parse.
export function endpointHost(endpoint: string | undefined): string | null {
  const value = endpoint?.trim();
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host || null;
  } catch {
    return null;
  }
}

// Drops anything that looks like a credential, then collapses whitespace.
function redact(text: string, secrets: string[]) {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join("[redacted]");
  for (const shape of CREDENTIAL_SHAPES) out = out.replace(shape, "[redacted]");
  return out.replace(/\s+/g, " ").trim();
}

// The provider's error message from a JSON error body: `{ error: { message } }`, `{ error: "..." }`, or `{ message }`.
function errorTextOf(body: string): string | null {
  let value: unknown;
  try { value = JSON.parse(body); } catch { return null; }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && typeof (error as Record<string, unknown>).message === "string") return (error as { message: string }).message;
  return typeof record.message === "string" ? record.message : null;
}

async function readFirstCharacters(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < limit) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // A broken body keeps what was read.
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text.slice(0, limit);
}

// Passes the fetch through, but reads the error body of a failed answer first, so the target can report only the status and
// the test can show the provider's message. The body is replaced by an empty response with the same status.
function withErrorText(captured: { error: string | null }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    if (response.ok || !response.body) return response;
    captured.error = errorTextOf(await readFirstCharacters(response.body, ERROR_BODY_MAX));
    return new Response(null, { status: response.status, headers: response.headers });
  }) as typeof fetch;
}

// The Workers AI binding throws its own message; the target only sees that a call failed, so the message is kept here.
function bindingWithErrorText(binding: WorkersAiBinding, captured: { error: string | null }): WorkersAiBinding {
  return {
    run: async (model, inputs, options) => {
      try {
        return await binding.run(model, inputs, options);
      } catch (error) {
        captured.error = error instanceof Error ? error.message : null;
        throw error;
      }
    },
  };
}

// Sends the fixed test request to one provider, with the model given, and answers its outcome. Logs `ai.provider_test` only.
export async function testAiProvider(env: AiEnv, provider: AiProvider, model: string, now: () => number = Date.now): Promise<AiProviderTestResponse> {
  const started = now();
  const secrets = [env.AZURE_AI_KEY, env.OPENROUTER_API_KEY].filter((secret): secret is string => Boolean(secret));
  const captured: { error: string | null } = { error: null };
  const finish = (ok: boolean, status: number | null, text: string): AiProviderTestResponse => {
    const latencyMs = Math.max(0, now() - started);
    const message = redact(text, secrets);
    logInfo("ai.provider_test", { provider, model, status, ok, latencyMs });
    return { ok, status, latencyMs, message: message.slice(0, ok ? REPLY_MAX : AI_PROVIDER_TEST_MESSAGE_MAX) };
  };

  // One provider only: no fallback. The target is built from that provider's settings alone, so the request uses the same code
  // as the tutor's requests.
  const settings: AiSettings = { providers: [{ provider, enabled: true, model }], dailyTurnCap: 0, dailySpeechCharCap: 0 };
  const scoped: AiEnv = { ...env, AI: env.AI ? bindingWithErrorText(env.AI, captured) : undefined };
  const [target] = configuredTargets(scoped, settings, withErrorText(captured));
  if (!target) return finish(false, null, "No credentials are set for this provider.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("provider test timeout", "TimeoutError")), AI_PROVIDER_TEST_TIMEOUT_MS);
  try {
    const opened = await abortable(target.open({ messages: [{ role: "user", content: TEST_PROMPT }], maxTokens: TEST_MAX_TOKENS }, controller.signal), controller.signal);
    if (!opened.ok) {
      const fallback = opened.status === null ? "The provider did not answer." : `The provider answered with HTTP ${opened.status}.`;
      return finish(false, opened.status, captured.error ?? fallback);
    }
    const accumulator = new ChatStreamAccumulator();
    let reply = "";
    for await (const chunk of opened.chunks) {
      const { text, error } = accumulator.push(chunk);
      if (error) return finish(false, error.status ?? opened.status, "The provider ended its answer with an error.");
      reply += text;
    }
    return finish(true, opened.status, reply);
  } catch {
    if (controller.signal.aborted) return finish(false, null, `The provider did not answer within ${AI_PROVIDER_TEST_TIMEOUT_MS / 1000} seconds.`);
    return finish(false, null, "The request did not reach the provider.");
  } finally {
    clearTimeout(timer);
  }
}
