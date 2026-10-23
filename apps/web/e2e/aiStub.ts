import { createServer, type Server } from "node:http";

// A stand-in for a chat-completions provider during browser tests (C14j). The e2e worker sends every tutor request here as its
// only provider (Azure AI Foundry's URL shape, see start-api.ts), so no test reaches a real model. Each reply is a pure function
// of the conversation it receives: the first user message picks a script, and the tool messages so far pick its next step.
// Replies stream as OpenAI chat-completion chunks, with text and tool arguments split across events like a real provider.

export const AI_STUB_MODEL = "gpt-4.1-mini";
// The tutor tests ask with these phrases; any other conversation gets a plain greeting.
export const NEXT_LESSON_REQUEST = "Teach me my next lesson";
export const SAVE_PRACTICE_REQUEST = "Save a practice for my lesson";
export const PRACTICE_SET_REQUEST = "Quiz me with a set";

type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };
type Call = { name: string; arguments: Record<string, unknown> };
// `calls` asks several tools in one response, as a practice set does.
type Reply = { text?: string; call?: Call; calls?: Call[] };

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
  if (!last) return { call: { name: "get_lesson", arguments: { summary: "Reading your next lesson", lessonId: "next" } } };
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
  if (!last) return { call: { name: "get_lesson", arguments: { summary: "Reading your next lesson", lessonId: "next" } } };
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

// Ask for a set → three questions in one response (a choice, a translation, a word order) → once all are answered together, a
// line naming how many came back answered.
function practiceSetScript(messages: Message[]): Reply {
  const results = toolResults(messages);
  if (!results.length) return { text: "Three questions.", calls: [
    { name: "ask_choice", arguments: { question: "What does [[het huis]] mean?", options: ["the house", "the tree", "the car"], correct: 0 } },
    { name: "ask_translate", arguments: { source: "I drink water.", reference: "Ik drink water." } },
    { name: "ask_word_order", arguments: { chunks: ["Ik", "drink", "water"], translation: "I drink water." } },
  ] };
  const answered = results.filter((result) => result.content.status === "answered").length;
  return { text: `You answered ${answered} of ${results.length}.` };
}

// Lesson activities (apps/api/src/lessonActivities/generate.ts) ask the same provider for one strict JSON output per activity, and
// for English cues of a role-play dialogue. The stub answers each with fixed content in the shape the generator reads, so generation
// is deterministic.
const ACTIVITY_SYSTEM_MARK = "language-learning activity data";
const ROLEPLAY_CUE_MARK = "Create English translations and cues for one original dialogue";
// The model's share of an activity (the generator assigns every ID and shuffles word order itself): choices give three option texts
// and the index of the correct one; word order gives the sentence's tokens in their correct order.
type ModelChoice = { prompt: string; options: [string, string, string]; correctIndex: number; explanation: string };
const choice = (prompt: string, options: [string, string, string], correctIndex: number, explanation: string): ModelChoice => ({ prompt, options, correctIndex, explanation });

// The tricky set: the first question is answered "het", so the browser tests can check it and move on; the second is left open for
// the reload test. The mixed set adds two more choices after the same four.
const trickyQuestions = () => [
  { kind: "choice", ...choice("Which article goes with “boek”?", ["de", "het", "een"], 1, "Boek is a het-word, so it takes het.") },
  { kind: "fill_in", prompt: "Ik ___ naar school.", referenceAnswers: ["ga"], explanation: "The verb after ik is ga." },
  { kind: "word_order", prompt: "Put the words in order: “I go to school.”", tokens: ["Ik", "ga", "naar", "school"], explanation: "The verb stands second, the place last." },
  { kind: "choice", ...choice("Which is the plural of “boek”?", ["boeken", "boekjes", "boek"], 0, "The plural adds -en.") },
];

// Dutch lines of the stub's dialogue and their English translations and cues; any other line is spoken back as it is.
const DIALOGUE_LINES: Record<string, { english: string; cue: string }> = {
  "Hallo! Ik ben Anna.": { english: "Hello! I am Anna.", cue: "Anna greets you and introduces herself." },
  "Hoi, ik ben Sofia.": { english: "Hi, I am Sofia.", cue: "Introduce yourself as Sofia." },
  "Leuk je te ontmoeten.": { english: "Nice to meet you.", cue: "Anna says it is nice to meet you." },
  "Ook leuk, dank je.": { english: "Nice too, thank you.", cue: "Reply that it is nice to meet her too." },
  "Tot ziens!": { english: "Goodbye!", cue: "Anna says goodbye." },
};

// The model's JSON for each non-roleplay type, in the shape the generator's model schemas read.
function activityOutput(type: string, user = ""): Record<string, unknown> | null {
  if (type === "story_summary") return {
    pairs: [
      { dutch: "Sofia bestelt koffie in een café.", english: "Sofia orders a coffee in a café." },
      { dutch: "Ze vraagt een vreemde de weg naar het station.", english: "She asks a stranger the way to the station." },
    ],
    newWords: [{ term: "het station", translation: "the station" }], metrics: ["lesson_share", "lesson_reading"],
  };
  if (type === "story_comprehension") return { questions: [
    choice("Where does Sofia order a coffee?", ["At a café", "At the station", "At school"], 0, "The scene opens in a café."),
    choice("What does Sofia ask for?", ["Directions", "Money", "A menu"], 0, "She asks the way to the station."),
    choice("Who does Sofia talk to?", ["A waiter", "A stranger", "Her teacher"], 1, "She talks to a stranger on the street."),
    choice("How does the conversation end?", ["Politely", "Angrily", "Abruptly"], 0, "They say goodbye politely."),
  ], metrics: ["lesson_reading"] };
  if (type === "tricky_grammar") return { questions: trickyQuestions(), metrics: ["lesson_grammar"] };
  if (type === "mixed_practice") return { questions: [
    ...trickyQuestions(),
    { kind: "choice", ...choice("Which article goes with “fiets”?", ["de", "het", "een"], 0, "Fiets is a de-word.") },
    { kind: "choice", ...choice("Which article goes with “water”?", ["de", "het", "een"], 1, "Water is a het-word.") },
  ], metrics: ["lesson_activities"] };
  if (type === "guided_grammar") return guidedOutput(user);
  return null;
}

// Guided grammar: two steps over the first chunks of the numbered "Source chunks" the prompt carries (at most four each). Chunk numbers
// are zero-based; the server maps them to the lesson's own blocks.
function guidedOutput(user: string): Record<string, unknown> | null {
  const count = (JSON.parse(/Source chunks \(JSON, numbered from 0\): (\[.*\])/.exec(user)?.[1] ?? "[]") as unknown[]).length;
  if (count < 2) return null;
  const half = Math.min(Math.ceil(count / 2), 4);
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => from + index);
  return {
    steps: [
      { chunks: range(0, half), question: choice("Which article goes with “boek”?", ["de", "het", "een"], 1, "Boek is a het-word, so it takes het.") },
      { chunks: range(half, Math.min(count, half + 4)), question: choice("Which is the plural of “boek”?", ["boeken", "boekjes", "boek"], 0, "The plural adds -en.") },
    ],
    followUps: ["tricky_grammar", "mixed_practice"], metrics: ["lesson_grammar"],
  };
}

// The reply for an activity generation or a role-play cue request, or null for any other conversation.
function activityReply(messages: Message[]): Reply | null {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  if (!system.includes(ACTIVITY_SYSTEM_MARK)) return null;
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  if (user.includes(ROLEPLAY_CUE_MARK)) {
    const turns = JSON.parse(/Source turns \(JSON, in order\): (\[.*\])/.exec(user)?.[1] ?? "[]") as Array<{ text: string }>;
    const cues = turns.map((turn, index) => ({ index, englishText: DIALOGUE_LINES[turn.text]?.english ?? turn.text, cue: DIALOGUE_LINES[turn.text]?.cue ?? "Say this line." }));
    return { text: JSON.stringify({ cues, metrics: ["lesson_activities"] }) };
  }
  const type = /Activity type: ([a-z_]+)\./.exec(user)?.[1] ?? "";
  const output = activityOutput(type, user);
  return output ? { text: JSON.stringify(output) } : null;
}

export function stubReply(messages: Message[]): Reply {
  const activity = activityReply(messages);
  if (activity) return activity;
  const first = messages.find((message) => message.role === "user")?.content ?? "";
  if (first.includes(NEXT_LESSON_REQUEST)) return nextLessonScript(messages);
  if (first.includes(SAVE_PRACTICE_REQUEST)) return savePracticeScript(messages);
  if (first.includes(PRACTICE_SET_REQUEST)) return practiceSetScript(messages);
  return { text: "Hallo! Zeg [[Goedemorgen]]." };
}

function chunks(reply: Reply) {
  const choice = (delta: Record<string, unknown>, finish: string | null = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }] });
  const events: unknown[] = [];
  const text = reply.text ?? "";
  for (let start = 0; start < text.length; start += 12) events.push(choice({ content: text.slice(start, start + 12) }));
  const calls = reply.calls ?? (reply.call ? [reply.call] : []);
  calls.forEach((call, index) => {
    const args = JSON.stringify(call.arguments);
    const half = Math.ceil(args.length / 2);
    const id = `call_${Math.random().toString(36).slice(2, 10)}`;
    events.push(choice({ tool_calls: [{ index, id, type: "function", function: { name: call.name, arguments: args.slice(0, half) } }] }));
    events.push(choice({ tool_calls: [{ index, function: { arguments: args.slice(half) } }] }));
  });
  events.push(choice({}, calls.length ? "tool_calls" : "stop"));
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
