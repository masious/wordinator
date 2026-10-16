import type { AiProvider, AiSettings } from "@wordinator/contracts/ai";
import { parseTargetSpans, toPublicPart, type TutorSpan, type TutorStoredPart, type TutorStreamEvent } from "@wordinator/contracts/tutor";
import { AiLimitError, AiRequestError, AiUnavailableError, streamChat, type AiChatMessage, type AiEnv } from "../ai";
import { logInfo } from "../logger";
import { learnerSnapshot, systemPrompt } from "./prompt";
import { readTutorProfile } from "./profile";
import { accountLibrary } from "./library";
import { insertMessageStatement, lastMessageAt, presentMessage, readHistory, touchConversationStatement, type StoredMessage } from "./store";
import { runTool, toolDefinitions, type ToolContext } from "./tools";

// The agent loop (docs/ai-tutor.md, docs/architecture.md#ai-tutor-and-learning-data). One turn: call the model with the system
// prompt (with the learner snapshot), the conversation so far, and the tools; stream its text; run read tools and unconfirmed
// writes in the Worker and call the model again with their results; stop when the model answers without tools, or at the first
// component or confirmation card, which leaves the message waiting for the learner. The turn's parts are stored as one
// assistant message when it ends, also when it fails. Prompts and answers are never logged.

// At most this many tool calls run per turn; after that the model is called once more without tools so it answers in text.
export const TUTOR_TOOL_CALLS_MAX = 8;
// No further model request starts after this long; the turn then ends with a `TURN_LIMIT` error part.
export const TUTOR_TURN_DEADLINE_MS = 100_000;
const MAX_MODEL_REQUESTS = TUTOR_TOOL_CALLS_MAX + 2;
// Each model request's output cap. Workers AI otherwise stops at 256 tokens, which cuts off answers and tool arguments, and
// reasoning models spend part of the cap before they write.
export const TUTOR_MAX_OUTPUT_TOKENS = 2_000;
// The stored message history sent with each turn.
const HISTORY_MESSAGES = 40;

export type TurnEmit = (event: TutorStreamEvent) => Promise<void>;
export type TurnOptions = {
  env: AiEnv; db: D1Database; settings: AiSettings; userId: string; conversationId: string; emit: TurnEmit;
  // Whether this turn's first model request is its turn start (always true except when a judge call already counted it).
  turnStart: boolean;
  fetcher?: typeof fetch; now?: () => number; random?: () => number; deadlineMs?: number;
};

// Puts the `[[...]]` marks back into a stored text part, so the model sees its earlier messages as it wrote them.
export function withSpanMarks(text: string, spans: readonly TutorSpan[]): string {
  let result = ""; let index = 0;
  for (const span of spans) {
    if (span.start < index || span.end > text.length || span.end < span.start) continue;
    result += `${text.slice(index, span.start)}[[${text.slice(span.start, span.end)}]]`;
    index = span.end;
  }
  return result + text.slice(index);
}

const toolMessageContent = (part: TutorStoredPart): string | null => {
  switch (part.type) {
    case "tool_result": return part.content;
    case "component": return JSON.stringify(part.answeredAt === null
      ? { status: "waiting", message: "The learner has not answered yet." }
      : part.skipped ? { status: "skipped", message: "The learner skipped this question without answering; nothing was recorded." }
      : { status: "answered", kind: part.kind, answer: part.answer, grade: part.grade });
    case "confirmation": return JSON.stringify(part.answeredAt === null
      ? { status: "waiting", message: "The learner has not confirmed or cancelled yet." }
      : part.answer === "cancelled" ? { status: "cancelled", message: "The learner cancelled; nothing changed." }
      : { status: "confirmed", ok: part.outcome?.ok ?? false, error: part.outcome?.error ?? null });
    default: return null;
  }
};

/** The stored messages as OpenAI chat messages: every tool call is followed by exactly one tool message. */
export function toModelMessages(messages: readonly Pick<StoredMessage, "role" | "parts">[]): AiChatMessage[] {
  const result: AiChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
      if (text) result.push({ role: "user", content: text });
      continue;
    }
    let current: Extract<AiChatMessage, { role: "assistant" }> | null = null;
    let results = new Map<string, string>();
    const finish = () => {
      if (!current) return;
      result.push(current);
      for (const call of current.tool_calls ?? []) result.push({ role: "tool", tool_call_id: call.id, content: results.get(call.id) ?? JSON.stringify({ error: "NO_RESULT" }) });
      current = null; results = new Map();
    };
    for (const part of message.parts) {
      if (part.type === "text") {
        if (current?.tool_calls?.length) finish();
        current ??= { role: "assistant", content: null };
        current.content = (current.content ?? "") + withSpanMarks(part.text, part.spans);
      } else if (part.type === "tool_call") {
        current ??= { role: "assistant", content: null };
        (current.tool_calls ??= []).push({ id: part.toolCallId, type: "function", function: { name: part.name, arguments: JSON.stringify(part.arguments) } });
      } else {
        const content = toolMessageContent(part);
        if (content !== null && "toolCallId" in part) results.set(part.toolCallId, content);
      }
    }
    finish();
  }
  return result;
}

function parseArguments(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const value: unknown = raw.trim() ? JSON.parse(raw) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value: value as Record<string, unknown> } : { ok: false };
  } catch {
    return { ok: false };
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  AI_UNAVAILABLE: "The tutor is unavailable right now. Try again later.",
  AI_REQUEST_FAILED: "The tutor could not answer. Try again.",
  TURN_LIMIT: "The tutor took too long to answer. Try again.",
};

/** Runs one turn and stores its assistant message; returns the stored message. Emits every event, ending with `done`. */
export async function runAgentTurn(options: TurnOptions): Promise<StoredMessage> {
  const { db, userId, conversationId, emit } = options;
  const now = options.now ?? Date.now;
  const started = now();
  const deadline = started + (options.deadlineMs ?? TUTOR_TURN_DEADLINE_MS);
  const [profile, library, history] = await Promise.all([
    readTutorProfile(db, userId), accountLibrary(db, userId), readHistory(db, userId, conversationId, HISTORY_MESSAGES),
  ]);
  const system = systemPrompt(library?.language ?? "nl", profile, await learnerSnapshot(db, userId, profile, started));
  const messageId = crypto.randomUUID();
  await emit({ type: "start", messageId });

  const parts: TutorStoredPart[] = [];
  let rawText = "";
  const flushText = () => {
    if (rawText.trim()) parts.push({ type: "text", ...parseTargetSpans(rawText) });
    rawText = "";
  };
  const context: ToolContext = { db, userId, conversationId, now, random: options.random ?? Math.random };
  let status: StoredMessage["status"] = "complete";
  let provider: AiProvider | null = null; let model: string | null = null;
  let turnStart = options.turnStart;
  let toolCalls = 0;
  try {
    for (let request = 0; ; request += 1) {
      if (now() > deadline || request >= MAX_MODEL_REQUESTS) {
        flushText();
        parts.push({ type: "error", code: "TURN_LIMIT", message: ERROR_MESSAGES.TURN_LIMIT! });
        await emit({ type: "error", code: "TURN_LIMIT", message: ERROR_MESSAGES.TURN_LIMIT! });
        status = "error";
        break;
      }
      const messages: AiChatMessage[] = [{ role: "system", content: system }, ...toModelMessages([...history, { role: "assistant", parts }])];
      const calls = [];
      for await (const event of streamChat({ messages, tools: toolCalls < TUTOR_TOOL_CALLS_MAX ? toolDefinitions() : undefined, maxTokens: TUTOR_MAX_OUTPUT_TOKENS }, {
        env: options.env, db, settings: options.settings, userId, conversationId, turnStart, fetcher: options.fetcher, now,
      })) {
        if (event.type === "text") { rawText += event.delta; await emit({ type: "text", delta: event.delta }); }
        else if (event.type === "tool_call") calls.push(event.call);
        else { provider = event.provider; model = event.model; }
      }
      // Only the turn's first request carries the turn start (streamChat marks only its first attempt row).
      turnStart = false;
      flushText();
      if (!calls.length) break;

      let waiting = false;
      for (const call of calls) {
        const toolCallId = crypto.randomUUID();
        const parsed = parseArguments(call.arguments);
        const callPart: TutorStoredPart = { type: "tool_call", toolCallId, name: call.name.slice(0, 100), arguments: parsed.ok ? parsed.value : {} };
        parts.push(callPart);
        const publicCall = toPublicPart(callPart);
        if (publicCall.type === "tool_call") await emit({ type: "tool_call", part: publicCall });
        toolCalls += 1;
        const outcome = waiting
          ? { kind: "result" as const, ok: false, error: "SKIPPED", detail: {}, data: { error: "SKIPPED", message: "Only one question or confirmation at a time; ask this again after the learner answers." } }
          : toolCalls > TUTOR_TOOL_CALLS_MAX
            ? { kind: "result" as const, ok: false, error: "TOOL_LIMIT", detail: {}, data: { error: "TOOL_LIMIT", message: "No more tools in this turn. Answer the learner now." } }
            : !parsed.ok
              ? { kind: "result" as const, ok: false, error: "INVALID_ARGUMENTS", detail: {}, data: { error: "INVALID_ARGUMENTS", message: "The arguments must be a JSON object." } }
              : await runTool(context, call.name, parsed.value);
        logInfo("ai.tool", { tool: callPart.name, outcome: outcome.kind === "result" ? (outcome.ok ? "ok" : outcome.error) : outcome.kind });
        if (outcome.kind === "result") {
          const part: TutorStoredPart = { type: "tool_result", toolCallId, name: callPart.name, ok: outcome.ok, error: outcome.error, detail: outcome.detail, content: JSON.stringify(outcome.data) };
          parts.push(part);
          const { content: _content, ...publicPart } = part;
          await emit({ type: "tool_result", part: publicPart });
        } else if (outcome.kind === "component") {
          const part: TutorStoredPart = { type: "component", toolCallId, kind: outcome.component.kind, view: outcome.view, component: outcome.component, answer: null, grade: null, answeredAt: null };
          parts.push(part);
          const { component: _component, ...publicPart } = part;
          await emit({ type: "component", part: publicPart });
          waiting = true;
        } else {
          const part: TutorStoredPart = { type: "confirmation", toolCallId, summary: outcome.summary, arguments: outcome.arguments, answer: null, outcome: null, answeredAt: null };
          parts.push(part);
          const { arguments: _arguments, ...publicPart } = part;
          await emit({ type: "confirmation", part: publicPart });
          waiting = true;
        }
      }
      if (waiting) { status = "awaiting_user"; break; }
    }
  } catch (error) {
    flushText();
    const code = error instanceof AiUnavailableError || error instanceof AiRequestError ? error.code : error instanceof AiLimitError ? error.code : "AI_REQUEST_FAILED";
    const message = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.AI_REQUEST_FAILED!;
    if (!(error instanceof AiUnavailableError || error instanceof AiRequestError || error instanceof AiLimitError)) logInfo("ai.turn_failed", { reason: error instanceof Error ? error.name : "unknown" });
    parts.push({ type: "error", code, message });
    await emit({ type: "error", code, message });
    status = "error";
  }

  const createdAt = Math.max(now(), (await lastMessageAt(db, conversationId)) + 1);
  const stored: StoredMessage = { id: messageId, conversationId, role: "assistant", parts, status, provider, model, createdAt };
  await db.batch([insertMessageStatement(db, userId, stored), touchConversationStatement(db, userId, conversationId, createdAt)]);
  await emit({ type: "done", message: presentMessage(stored) });
  return stored;
}
