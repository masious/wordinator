import { apiErrorSchema } from "@wordinator/contracts";
import { aiLimitErrorSchema } from "@wordinator/contracts/ai";
import { tutorSpeechResponseSchema, tutorStreamEventSchema, type TutorSpeechRequest, type TutorStreamEvent } from "@wordinator/contracts/tutor";
import { ApiError } from "../../api";
import type { ClipResult, ClipSource } from "../TutorComponents";

// The tutor's streamed turns (docs/ai-tutor.md#api). Both turn routes are POSTs answering `text/event-stream`, so they are read
// with fetch and a stream reader rather than EventSource. A refusal before the stream starts is an ordinary JSON error and
// throws an ApiError carrying the whole body (`resetsAt` for the daily limit).

export const conversationPath = (conversationId: string) => `/api/ai/conversations/${encodeURIComponent(conversationId)}`;

async function errorOf(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try { body = await response.json(); } catch { /* No JSON body. */ }
  const parsed = apiErrorSchema.safeParse(body);
  return new ApiError(response.status, parsed.success ? parsed.data.error.code : "UNKNOWN_ERROR", parsed.success ? parsed.data.error.message : "Something went wrong.", body);
}

// Splits server-sent events out of the byte stream and hands each valid event over; unknown or malformed events are skipped.
export async function streamTurn(path: string, body: unknown, onEvent: (event: TutorStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch(path, {
    method: "POST", signal, body: JSON.stringify(body),
    headers: { "content-type": "application/json", accept: "text/event-stream" },
  });
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/event-stream") || !response.body) throw await errorOf(response);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (block: string) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data) return;
    let json: unknown;
    try { json = JSON.parse(data); } catch { return; }
    const parsed = tutorStreamEventSchema.safeParse(json);
    if (parsed.success) onEvent(parsed.data);
  };
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) dispatch(block);
    if (done) { if (buffer.trim()) dispatch(buffer); return; }
  }
}

// The daily limit's reset time from a refusal body, or the next UTC midnight when the body has none.
export function limitResetsAt(body: unknown): number {
  const parsed = aiLimitErrorSchema.safeParse(body);
  if (parsed.success) return parsed.data.error.resetsAt;
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

// On-demand audio of a stored assistant message: a span by index or a Say it or Dictation sentence (docs/speech.md#on-demand-audio).
export function tutorClip(conversationId: string, messageId: string, request: TutorSpeechRequest): ClipSource {
  return {
    key: `tutor:${messageId}:${"spanIndex" in request ? `span:${request.spanIndex}` : `tool:${request.toolCallId}`}`,
    load: () => loadClip(`${conversationPath(conversationId)}/messages/${encodeURIComponent(messageId)}/speech`, JSON.stringify(request)),
  };
}

// One request to an on-demand speech route (the tutor's, or an AI practice's on the lesson page), read as a clip result.
export async function loadClip(path: string, body?: string): Promise<ClipResult> {
  const response = await fetch(path, { method: "POST", ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body }) });
  let json: unknown = null;
  try { json = await response.json(); } catch { /* No JSON body. */ }
  if (response.status === 200) { const parsed = tutorSpeechResponseSchema.safeParse(json); return parsed.success ? { status: "ready", url: parsed.data.url } : { status: "failed" }; }
  if (response.status === 202) return { status: "pending" };
  if (response.status === 429) return { status: "limit", resetsAt: limitResetsAt(json) };
  const code = apiErrorSchema.safeParse(json);
  if (response.status === 503 && code.success && code.data.error.code === "SPEECH_UNAVAILABLE") return { status: "unavailable" };
  return { status: "failed" };
}
