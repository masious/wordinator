import { tutorStreamEventSchema, type TutorStreamEvent } from "@wordinator/contracts/tutor";
import { expect } from "vitest";
import { addLesson, blocks, createCourse, documentOf, join, seedGroup, seedUser, signIn, word } from "./courseApi";
import { fetchWorker } from "./worker";

// Shared helpers for the tutor suites (C14g): requests to the Worker entry point with a stubbed Workers AI binding (the only
// configured provider in tests, since no provider keys are set), scripted model replies, and a server-sent-event reader. No
// test reaches a real provider.

const encoder = new TextEncoder();
type Chunk = Record<string, unknown>;
export type ModelReply = Chunk[] | ((inputs: Record<string, unknown>) => Chunk[]);

export const say = (text: string): Chunk[] => [
  { choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  { choices: [], usage: { prompt_tokens: 20, completion_tokens: 5 } },
];
// Read and write tools take a learner-facing `summary`; scripted calls get one unless they set their own (or `summary: undefined`
// to leave it out).
const UNSUMMARIZED = new Set(["complete_lesson", "reset_lesson", "save_ai_practice"]);
const withSummary = (name: string, args: unknown) => !name.startsWith("ask_") && !UNSUMMARIZED.has(name) && args && typeof args === "object" && !Array.isArray(args) && !("summary" in args)
  ? { summary: `Running ${name}`, ...args } : args;

export const callTool = (name: string, args: unknown, extra: Array<{ name: string; args: unknown }> = []): Chunk[] => [
  {
    choices: [{
      index: 0, finish_reason: null,
      delta: { tool_calls: [{ name, args }, ...extra].map((call, index) => ({ index, id: `call_${index}`, type: "function", function: { name: call.name, arguments: JSON.stringify(withSummary(call.name, call.args)) } })) },
    }],
  },
  { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
];

export function scriptedAi(script: ModelReply[]) {
  const calls: Array<Record<string, unknown>> = [];
  const binding: WorkersAiBinding = {
    run: async (_model, inputs) => {
      calls.push(inputs);
      const next = script.shift();
      if (!next) throw new Error("unexpected model call");
      const chunks = typeof next === "function" ? next(inputs) : next;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
    },
  };
  return { binding, calls, remaining: () => script.length };
}

type ModelMessage = { role: string; content: string | null; tool_call_id?: string };
export const modelMessages = (inputs: Record<string, unknown> | undefined) => (inputs?.messages ?? []) as ModelMessage[];
export const toolMessages = (inputs: Record<string, unknown> | undefined) => modelMessages(inputs).filter((message) => message.role === "tool");

export async function call(method: string, path: string, cookie: string | null, body?: unknown, extraEnv: Partial<Env> = {}) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetchWorker(`https://wordinator.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, extraEnv);
}

export async function readEvents(response: Response): Promise<TutorStreamEvent[]> {
  const text = await response.text();
  expect(response.status, text).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  return text.split("\n\n").filter((block) => block.trim()).map((block) => {
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    const name = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
    const event = tutorStreamEventSchema.parse(JSON.parse(data));
    expect(name).toBe(event.type);
    return event;
  });
}

export async function newConversation(cookie: string) {
  const response = await call("POST", "/api/ai/conversations", cookie);
  expect(response.status).toBe(201);
  return ((await response.json()) as { conversation: { id: string } }).conversation.id;
}

/**
 * A library with a published course (two published lessons with words and one unpublished lesson), a draft course the learner
 * cannot see, and another library with its own course. The learner and a second learner ("rival") are members of the first.
 */
export async function seedLibrary() {
  const ownerId = await seedUser("owner");
  const learnerId = await seedUser("learner");
  const rivalId = await seedUser("rival");
  const strangerId = await seedUser("stranger");
  const groupId = await seedGroup("owner", ownerId);
  await join(groupId, learnerId); await join(groupId, rivalId);
  const otherGroupId = await seedGroup("stranger", strangerId);
  const [owner, learner, rival, stranger] = await Promise.all(["owner", "learner", "rival", "stranger"].map(signIn)) as [string, string, string, string];

  const course = await createCourse(groupId, owner, true, { title: "Dutch foundations", summary: "Built together." });
  const huis = word("het huis"); const tafel = word("de tafel"); const stoel = word("de stoel");
  const example = blocks.example("Ik woon in Utrecht.", "I live in Utrecht.");
  const first = await addLesson(groupId, course.id, owner, "Greetings", { document: documentOf(blocks.heading("At home"), blocks.vocabulary(huis, tafel), example) });
  const second = await addLesson(groupId, course.id, owner, "Furniture", { document: documentOf(blocks.vocabulary(stoel)) });
  const unpublished = await addLesson(groupId, course.id, owner, "Secret draft lesson", { published: false, document: documentOf(blocks.paragraph("Not yet")) });
  const draftCourse = await createCourse(groupId, owner, false, { title: "Hidden course", summary: "Draft." });
  const hidden = await addLesson(groupId, draftCourse.id, owner, "Hidden lesson", { document: documentOf(blocks.paragraph("Invisible")) });
  const otherCourse = await createCourse(otherGroupId, stranger, true, { title: "Other library course", summary: "Elsewhere." });
  const foreign = await addLesson(otherGroupId, otherCourse.id, stranger, "Foreign lesson", { document: documentOf(blocks.vocabulary(word("de fiets"))) });
  return {
    ownerId, learnerId, rivalId, groupId, owner, learner, rival, stranger, course,
    lessons: { first: first.lesson, second: second.lesson, unpublished: unpublished.lesson, hidden: hidden.lesson, foreign: foreign.lesson },
    words: { huis, tafel, stoel }, example,
  };
}
