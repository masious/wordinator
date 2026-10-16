import { createServer, type Server } from "node:http";

// A stand-in for a chat-completions provider during browser tests (C14j). The e2e worker sends every tutor request here as its
// only provider (Azure AI Foundry's URL shape, see start-api.ts), so no test reaches a real model. Each reply is a pure function
// of the conversation it receives: the first user message picks a script, and the tool messages so far pick its next step.
// Replies stream as OpenAI chat-completion chunks, with text and tool arguments split across events like a real provider.

export const AI_STUB_MODEL = "gpt-4.1-mini";
// The tutor tests ask with these phrases; any other conversation gets a plain greeting.
export const NEXT_LESSON_REQUEST = "Teach me my next lesson";
export const SAVE_PRACTICE_REQUEST = "Save a practice for my lesson";

type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };
type Reply = { text?: string; call?: { name: string; arguments: Record<string, unknown> } };

const parse = (value: string): Record<string, unknown> => {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
};

// The tool results of the conversation, oldest first, by the name of the call they answer.
function toolResults(messages: Message[]) {
  const names = new Map<string, string>();
  const results: Array<{ name: string; content: Record<string, unknown> }> = [];
  for (const message of messages) {
    if (message.role === "assistant") for (const call of message.tool_calls ?? []) names.set(call.id, call.function.name);
    if (message.role === "tool") results.push({ name: names.get(message.tool_call_id) ?? "", content: parse(message.content) });
  }
  return results;
}

type StubLesson = { lessonId: string; title: string; blocks: Array<{ id: string; type: string; sentence?: string }> };

// The lesson's first example as a one-blank fill-in, its last word blanked.
function exampleFillIn(lesson: StubLesson) {
  const sentence = lesson.blocks.find((block) => block.type === "example")?.sentence ?? "Ik drink water.";
  const end = /[.!?]$/.exec(sentence)?.[0] ?? "";
  const words = sentence.slice(0, sentence.length - end.length).split(" ");
  const answer = words.pop() ?? "";
  return { prompt: `${words.join(" ")} …${end}`, answers: [answer] };
}

// Ask for the next lesson → read it → a fill-in on its first example (the last word blanked) → once answered, offer to mark the
// lesson complete → once confirmed, a closing line.
function nextLessonScript(messages: Message[]): Reply {
  const results = toolResults(messages);
  const lesson = results.find((result) => result.name === "get_lesson")?.content.lesson as StubLesson | null | undefined;
  const last = results.at(-1);
  if (!last) return { call: { name: "get_lesson", arguments: { lessonId: "next" } } };
  if (!lesson) return { text: "There is no lesson to study next." };
  if (last.name === "get_lesson") {
    return { text: `Let's practise **${lesson.title}**.`, call: { name: "ask_fill_in", arguments: { lessonId: lesson.lessonId, ...exampleFillIn(lesson) } } };
  }
  if (last.name === "ask_fill_in") return { text: "Well done.", call: { name: "complete_lesson", arguments: { lessonId: lesson.lessonId } } };
  if (last.name === "complete_lesson") return { text: last.content.status === "confirmed" ? `${lesson.title} is complete.` : "Let's keep going." };
  return { text: "Let's keep going." };
}

// Ask to save a practice → read the next lesson → offer a fill-in on its example, placed after that example → once confirmed, a
// closing line.
function savePracticeScript(messages: Message[]): Reply {
  const results = toolResults(messages);
  const lesson = results.find((result) => result.name === "get_lesson")?.content.lesson as StubLesson | null | undefined;
  const last = results.at(-1);
  if (!last) return { call: { name: "get_lesson", arguments: { lessonId: "next" } } };
  if (!lesson) return { text: "There is no lesson to add a practice to." };
  if (last.name === "get_lesson") {
    const anchor = lesson.blocks.find((block) => block.type === "example") ?? lesson.blocks[0];
    return {
      text: "Here is a practice for this lesson.",
      call: { name: "save_ai_practice", arguments: { practice: { kind: "fill_in", payload: exampleFillIn(lesson) }, lessons: [{ lessonId: lesson.lessonId, afterBlockId: anchor?.id }] } },
    };
  }
  return { text: last.content.status === "confirmed" && last.content.ok ? "The practice is saved." : "Nothing was saved." };
}

export function stubReply(messages: Message[]): Reply {
  const first = messages.find((message) => message.role === "user")?.content ?? "";
  if (first.includes(NEXT_LESSON_REQUEST)) return nextLessonScript(messages);
  if (first.includes(SAVE_PRACTICE_REQUEST)) return savePracticeScript(messages);
  return { text: "Hallo! Zeg [[Goedemorgen]]." };
}

function chunks(reply: Reply) {
  const choice = (delta: Record<string, unknown>, finish: string | null = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }] });
  const events: unknown[] = [];
  const text = reply.text ?? "";
  for (let start = 0; start < text.length; start += 12) events.push(choice({ content: text.slice(start, start + 12) }));
  if (reply.call) {
    const args = JSON.stringify(reply.call.arguments);
    const half = Math.ceil(args.length / 2);
    const id = `call_${Math.random().toString(36).slice(2, 10)}`;
    events.push(choice({ tool_calls: [{ index: 0, id, type: "function", function: { name: reply.call.name, arguments: args.slice(0, half) } }] }));
    events.push(choice({ tool_calls: [{ index: 0, function: { arguments: args.slice(half) } }] }));
  }
  events.push(choice({}, reply.call ? "tool_calls" : "stop"));
  events.push({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } });
  return events;
}

export function startAiStub(port: number): Server {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (part: string) => { body += part; });
    request.on("end", () => {
      const { messages = [] } = parse(body) as { messages?: Message[] };
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      for (const event of chunks(stubReply(messages))) response.write(`data: ${JSON.stringify(event)}\n\n`);
      response.end("data: [DONE]\n\n");
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}
