import type { AiProvider, AiSettings } from "@wordinator/contracts/ai";
import { logInfo } from "../logger";
import { AiRequestError, AiUnavailableError } from "./errors";
import { configuredTargets, isRetryableStatus, type AiChatRequest, type AiEnv } from "./providers";
import { ChatStreamAccumulator, abortable, type AiTokenUsage, type AiToolCall } from "./stream";
import { estimateCostMicroUsd, recordAiUsage } from "./usage";

// One streamed model request with fallback (docs/ai-tutor.md#providers-and-fallback). Providers are tried in the configured
// order, skipping those turned off or without a key or binding. A `429`, `5xx`, refused key, network failure, or timeout
// moves to the next provider as long as nothing has been streamed yet; once text has been streamed, a failure ends the
// request with `AiRequestError(partial)`. Every attempt that reached a provider writes an `ai_usage` row and an
// `ai.request` log line; prompts, answers, tool payloads, and keys are never logged.

export const AI_FIRST_EVENT_TIMEOUT_MS = 20_000;
export const AI_REQUEST_TIMEOUT_MS = 120_000;

export type AiStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: AiToolCall }
  | { type: "done"; provider: AiProvider; model: string; finishReason: string | null; usage: AiTokenUsage };

export type StreamChatOptions = {
  env: AiEnv;
  db: D1Database;
  settings: AiSettings;
  userId: string;
  conversationId?: string | null;
  // True for the first model request of a tutor turn: its first `ai_usage` row carries `turn_start`, which the daily turn
  // cap counts. The further requests of the turn's tool loop pass false.
  turnStart?: boolean;
  fetcher?: typeof fetch;
  now?: () => number;
  firstEventTimeoutMs?: number;
  requestTimeoutMs?: number;
};

type Failure = { reason: "status" | "timeout" | "network" | "stream_error" | "aborted"; status: number | null; retryable: boolean };

export async function* streamChat(request: AiChatRequest, options: StreamChatOptions): AsyncGenerator<AiStreamEvent, void, undefined> {
  const { env, db, settings, userId, fetcher = fetch, now = Date.now } = options;
  const targets = configuredTargets(env, settings, fetcher);
  if (!targets.length) {
    logInfo("ai.unavailable", { reason: "no_provider" });
    throw new AiUnavailableError();
  }
  let turnStart = options.turnStart ?? false;
  for (const [position, target] of targets.entries()) {
    const started = now();
    const controller = new AbortController();
    const firstEventTimer = setTimeout(() => controller.abort(new DOMException("first event timeout", "TimeoutError")), options.firstEventTimeoutMs ?? AI_FIRST_EVENT_TIMEOUT_MS);
    const requestTimer = setTimeout(() => controller.abort(new DOMException("request timeout", "TimeoutError")), options.requestTimeoutMs ?? AI_REQUEST_TIMEOUT_MS);
    const accumulator = new ChatStreamAccumulator();
    let streamed = false;
    let status: number | null = null;
    let failure: Failure | null = null;
    let settled = false;
    const settle = async (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(firstEventTimer); clearTimeout(requestTimer);
      const usage = accumulator.usage ?? { tokensIn: 0, tokensOut: 0, costUsd: null };
      const costMicroUsd = usage.costUsd !== null ? Math.round(usage.costUsd * 1_000_000) : estimateCostMicroUsd(target.model, usage.tokensIn, usage.tokensOut);
      await recordAiUsage(db, {
        userId, conversationId: options.conversationId ?? null, provider: target.provider, model: target.model, turnStart,
        tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, costMicroUsd, ok,
      }, now());
      turnStart = false;
      logInfo("ai.request", {
        provider: target.provider, model: target.model, status: failure?.status ?? status, ok, reason: failure?.reason,
        tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, durationMs: now() - started,
      });
    };
    try {
      try {
        const opened = await abortable(target.open(request, controller.signal), controller.signal);
        status = opened.status;
        if (!opened.ok) {
          failure = { reason: "status", status: opened.status, retryable: opened.retryable };
        } else {
          for await (const chunk of opened.chunks) {
            clearTimeout(firstEventTimer);
            const { text, error } = accumulator.push(chunk);
            if (error) {
              failure = { reason: "stream_error", status: error.status, retryable: !streamed && isRetryableStatus(error.status) };
              break;
            }
            if (text) {
              streamed = true;
              yield { type: "text", delta: text };
            }
          }
        }
      } catch {
        // A rejected fetch or binding call, a broken stream, or one of the timeouts.
        failure = { reason: controller.signal.aborted ? "timeout" : "network", status: null, retryable: !streamed };
      }
      if (!failure) {
        await settle(true);
        for (const call of accumulator.toolCalls()) yield { type: "tool_call", call };
        yield {
          type: "done", provider: target.provider, model: target.model, finishReason: accumulator.finishReason,
          usage: accumulator.usage ?? { tokensIn: 0, tokensOut: 0, costUsd: null },
        };
        return;
      }
      await settle(false);
    } finally {
      // The consumer stopped reading mid-stream: record the attempt as failed.
      if (!settled) {
        failure ??= { reason: "aborted", status, retryable: false };
        controller.abort(new DOMException("consumer stopped", "AbortError"));
        await settle(false);
      }
    }
    if (!failure.retryable) throw new AiRequestError(failure.status, streamed);
    const next = targets[position + 1];
    if (next) logInfo("ai.fallback", { from: target.provider, to: next.provider, reason: failure.reason, status: failure.status });
  }
  logInfo("ai.unavailable", { reason: "all_failed" });
  throw new AiUnavailableError();
}

// Collects a whole streamed request: the text, tool calls, and final event. Convenient for non-streaming callers and tests.
export async function completeChat(request: AiChatRequest, options: StreamChatOptions) {
  let text = "";
  const toolCalls: AiToolCall[] = [];
  let done: Extract<AiStreamEvent, { type: "done" }> | null = null;
  for await (const event of streamChat(request, options)) {
    if (event.type === "text") text += event.delta;
    else if (event.type === "tool_call") toolCalls.push(event.call);
    else done = event;
  }
  if (!done) throw new AiUnavailableError();
  return { text, toolCalls, provider: done.provider, model: done.model, finishReason: done.finishReason, usage: done.usage };
}
