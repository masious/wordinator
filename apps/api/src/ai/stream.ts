// Parsing of streamed chat completions (C14f). Every target streams server-sent events; this module turns them into JSON
// chunks and folds them into text deltas, assembled tool calls, usage, and errors:
// - OpenAI chat-completion chunks (OpenRouter and Azure AI Foundry v1):
//   `choices[0].delta.content`, `choices[0].delta.tool_calls[{ index, id, function: { name, arguments } }]` with the
//   arguments split across chunks, `finish_reason`, and `usage` on a final chunk (Azure may send a first chunk with empty
//   `choices`; OpenRouter repeats `finish_reason` on its usage chunk and adds `usage.cost` in USD).
// - A mid-stream error (OpenRouter): a top-level `error` object, with `choices[0].finish_reason: "error"`.

export type AiToolCall = { id: string; name: string; arguments: string };
export type AiTokenUsage = { tokensIn: number; tokensOut: number; costUsd: number | null };
export type StreamError = { status: number | null };

// Yields the data of each event. Comment lines (`: OPENROUTER PROCESSING`) and other fields are ignored; `[DONE]` ends it.
export async function* sseData(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = stream.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  let buffer = "";
  let data: string[] = [];
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await abortable(reader.read(), signal);
      if (!done) buffer += value;
      else buffer += "\n\n";
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line === "") {
          if (data.length) {
            const payload = data.join("\n");
            data = [];
            if (payload.trim() === "[DONE]") {
              finished = true;
              return;
            }
            yield payload;
          }
        } else if (line.startsWith("data:")) {
          data.push(line.slice(line.startsWith("data: ") ? 6 : 5));
        }
      }
      if (done) {
        finished = true;
        return;
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    else reader.releaseLock();
  }
}

// JSON chunks of an event stream; data that is not JSON is skipped.
export async function* sseJson(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<unknown> {
  for await (const payload of sseData(stream, signal)) {
    try {
      yield JSON.parse(payload) as unknown;
    } catch {
      // Not a JSON event; nothing to read from it.
    }
  }
}

// Rejects with the signal's reason once it aborts, so a stalled read or a call without signal support stops.
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asCount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

type PartialCall = { id: string; name: string; arguments: string };

export class ChatStreamAccumulator {
  private readonly calls = new Map<number, PartialCall>();
  usage: AiTokenUsage | null = null;
  finishReason: string | null = null;

  // Folds one chunk; returns its text delta (if any) and a stream error (if the chunk is one).
  push(chunk: unknown): { text: string; error: StreamError | null } {
    if (!isRecord(chunk)) return { text: "", error: null };
    if (isRecord(chunk.usage)) {
      const cost = chunk.usage.cost;
      this.usage = {
        tokensIn: asCount(chunk.usage.prompt_tokens ?? chunk.usage.input_tokens),
        tokensOut: asCount(chunk.usage.completion_tokens ?? chunk.usage.output_tokens),
        costUsd: typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null,
      };
    }
    if (chunk.error !== undefined && chunk.error !== null) {
      const code = isRecord(chunk.error) ? chunk.error.code : null;
      return { text: "", error: { status: typeof code === "number" ? code : null } };
    }
    let text = "";
    if (Array.isArray(chunk.choices)) {
      const choice: unknown = chunk.choices[0];
      if (isRecord(choice)) {
        const delta = isRecord(choice.delta) ? choice.delta : isRecord(choice.message) ? choice.message : null;
        if (delta) {
          if (typeof delta.content === "string") text += delta.content;
          if (Array.isArray(delta.tool_calls)) this.pushToolCalls(delta.tool_calls);
        }
        if (typeof choice.finish_reason === "string") {
          if (choice.finish_reason === "error") return { text, error: { status: null } };
          this.finishReason = choice.finish_reason;
        }
      }
    }
    return { text, error: null };
  }

  private pushToolCalls(entries: unknown[]) {
    // OpenAI-style partials: merged by index, arguments appended.
    entries.forEach((entry, position) => {
      if (!isRecord(entry) || !isRecord(entry.function)) return;
      const index = typeof entry.index === "number" ? entry.index : position;
      const call = this.calls.get(index) ?? { id: "", name: "", arguments: "" };
      if (typeof entry.id === "string" && entry.id) call.id = entry.id;
      if (typeof entry.function.name === "string" && entry.function.name && !call.name) call.name = entry.function.name;
      const args = entry.function.arguments;
      if (typeof args === "string") call.arguments += args;
      else if (args !== undefined && args !== null) call.arguments = JSON.stringify(args);
      this.calls.set(index, call);
    });
  }

  // The assembled tool calls in index order. A call without an ID gets a fresh one; empty arguments become `{}`.
  toolCalls(): AiToolCall[] {
    return [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.name)
      .map(([, call]) => ({ id: call.id || `call_${crypto.randomUUID()}`, name: call.name, arguments: call.arguments.trim() || "{}" }));
  }
}
