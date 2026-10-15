import type { Context } from "hono";

// Typed failures of the provider layer (C14f). Routes turn them into responses with `aiErrorResponse`.

// `429`: the account reached a daily cap. `resetsAt` is the next UTC midnight in epoch milliseconds.
export class AiLimitError extends Error {
  constructor(readonly code: "AI_DAILY_LIMIT" | "SPEECH_DAILY_LIMIT", readonly resetsAt: number) {
    super(code === "AI_DAILY_LIMIT" ? "You have reached today's tutor limit." : "You have reached today's audio limit.");
    this.name = "AiLimitError";
  }
}

// `503`: no provider is configured, or every configured provider was busy, failing, or timed out.
export class AiUnavailableError extends Error {
  readonly code = "AI_UNAVAILABLE";
  constructor() {
    super("The tutor is unavailable right now. Try again later.");
    this.name = "AiUnavailableError";
  }
}

// `502`: a provider refused the request itself (a 4xx other than throttling or credentials), or failed after it had
// already streamed part of its answer, so the turn cannot move to another provider. `status` is the provider's HTTP
// status when there was one.
export class AiRequestError extends Error {
  readonly code = "AI_REQUEST_FAILED";
  constructor(readonly status: number | null, readonly partial: boolean) {
    super("The tutor could not answer. Try again.");
    this.name = "AiRequestError";
  }
}

export function aiErrorResponse(context: Context, error: unknown): Response | null {
  const requestId = context.get("requestId") as string | undefined;
  if (error instanceof AiLimitError) {
    return context.json({ error: { code: error.code, message: error.message, resetsAt: error.resetsAt, requestId } }, 429);
  }
  if (error instanceof AiUnavailableError) return context.json({ error: { code: error.code, message: error.message, requestId } }, 503);
  if (error instanceof AiRequestError) return context.json({ error: { code: error.code, message: error.message, requestId } }, 502);
  return null;
}
